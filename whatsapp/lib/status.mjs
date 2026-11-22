import { digits } from './control.mjs'

/**
 * Status modes for Ase.
 *
 * The existing marketing worker already owns the approval queue and the actual
 * send. This module only decides WHAT should be queued next:
 *
 *   auto        - keep using the website's AI draft generator
 *   stats       - live counts (houses, bookings, chats)
 *   event       - react to newly published / released houses
 *   random      - shuffle-bag from an admin-edited pool, no repeats
 *   round_robin - cycle through topics in order
 *   hybrid      - weighted mix of stats, random and round robin
 *   off         - no automatic statuses
 */

const CACHE_MS = 5000

export const STATUS_DEFAULTS = {
  mode: 'off',
  interval_minutes: 50,
  daily_limit: 12,
  quiet_hours: { enabled: false, start: '22:00', end: '06:00' },
  templates: {},
  topics: [],
  random_pool: [],
  no_repeat_window: 10,
  event_hooks: {
    new_listing: false,
    released: false,
    paid: false,
    booking_confirmed: false,
  },
  require_approval: true,
  last_event_at: null,
}

export const STATUS_MODES = ['off', 'auto', 'stats', 'event', 'random', 'round_robin', 'hybrid']

function mergeDefaults(settings) {
  const merged = { ...STATUS_DEFAULTS, ...(settings || {}) }
  for (const key of Object.keys(STATUS_DEFAULTS)) {
    const value = STATUS_DEFAULTS[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = { ...value, ...(settings?.[key] || {}) }
    }
  }
  if (!STATUS_MODES.includes(merged.mode)) merged.mode = 'off'
  return merged
}

function minutesFromHHMM(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return fallback
  return hour * 60 + minute
}

function nairobiMinute() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  return Number(parts.find((p) => p.type === 'hour')?.value || 0) * 60 +
    Number(parts.find((p) => p.type === 'minute')?.value || 0)
}

function inQuietHours(quiet) {
  if (!quiet?.enabled) return false
  const now = nairobiMinute()
  const start = minutesFromHHMM(quiet.start, 22 * 60)
  const end = minutesFromHHMM(quiet.end, 6 * 60)
  if (start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

function pickTemplate(templates, key, fallback) {
  const value = templates?.[key]
  return typeof value === 'string' && value.trim() ? value : fallback
}

function money(value) {
  const amount = Number(value || 0)
  return amount > 0 ? `KES ${amount.toLocaleString('en-KE')}` : 'KES 0'
}

function render(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

export function createStatus(supabase, { log = console } = {}) {
  let cache = mergeDefaults(null)
  let cacheAt = 0

  async function read(force = false) {
    if (!force && Date.now() - cacheAt < CACHE_MS) return cache
    const { data, error } = await supabase
      .from('whatsapp_status_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    cache = mergeDefaults(data)
    cacheAt = Date.now()
    return cache
  }

  async function write(patch, actor = 'worker') {
    const current = await read(true)
    const next = { ...current, ...(patch || {}) }
    const row = {
      mode: next.mode,
      interval_minutes: next.interval_minutes,
      daily_limit: next.daily_limit,
      quiet_hours: next.quiet_hours,
      templates: next.templates,
      topics: next.topics,
      random_pool: next.random_pool,
      no_repeat_window: next.no_repeat_window,
      event_hooks: next.event_hooks,
      require_approval: next.require_approval,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('whatsapp_status_settings')
      .update(row)
      .eq('id', 1)
    if (error) throw error
    cache = next
    cacheAt = Date.now()
    return next
  }

  async function record(body, { mode, topic, kind = 'scheduled', meta = {} } = {}) {
    const { error } = await supabase.from('whatsapp_status_history').insert({
      mode: mode || cache.mode,
      topic: topic || null,
      body: String(body).slice(0, 3000),
      kind,
      meta,
    })
    if (error) log?.warn?.('[status] could not record history:', error.message)
  }

  async function recentBodies(limit = 100) {
    const { data, error } = await supabase
      .from('whatsapp_status_history')
      .select('body, topic, mode')
      .order('created_at', { ascending: false })
      .limit(Math.max(10, Number(limit) + 10))
    if (error) {
      log?.warn?.('[status] history query failed:', error.message)
      return []
    }
    return data || []
  }

  async function statsBody(settings) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const today = new Date().toISOString().slice(0, 10)

    const [published, released, chats, urgent] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .eq('status', 'published').gte('created_at', today),
      supabase.from('listings').select('id', { count: 'exact', head: true })
        .gte('released_at', since),
      supabase.from('whatsapp_sessions').select('wa_jid', { count: 'exact', head: true })
        .gte('updated_at', since),
      supabase.from('whatsapp_urgent').select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ])

    const vars = {
      new_houses: published.count ?? 0,
      released: released.count ?? 0,
      chats: chats.count ?? 0,
      urgent: urgent.count ?? 0,
    }
    const template = pickTemplate(
      settings.templates,
      'stats',
      'AseHanta update 🇰🇪\nNew houses today: {new_houses}\nReleased: {released}\nChats today: {chats}\nOpen urgent cases: {urgent}\nList or hunt at asehanta.com'
    )
    return { body: render(template, vars), topic: 'stats' }
  }

  async function randomBody(settings) {
    const pool = (Array.isArray(settings.random_pool) ? settings.random_pool : [])
      .map((item) => (typeof item === 'string' ? item : item?.body))
      .filter((item) => typeof item === 'string' && item.trim())
    if (!pool.length) return null

    const window = Math.min(pool.length - 1, Math.max(0, Number(settings.no_repeat_window || 10)))
    const recent = await recentBodies(window)
    const used = new Set(recent.map((row) => row.body.trim()))
    const available = pool.filter((item) => !used.has(item.trim()))
    const chosen = (available.length ? available : pool)[Math.floor(Math.random() * (available.length || pool.length))]
    const topic = (Array.isArray(settings.random_pool) ? settings.random_pool.find((i) => i?.body === chosen)?.topic : null) || 'random'
    return { body: chosen, topic }
  }

  async function roundRobinBody(settings) {
    const topics = (Array.isArray(settings.topics) ? settings.topics : [])
      .map((item) => (typeof item === 'string' ? { name: item } : item))
      .filter((item) => item && (item.name || item.body || item.topic))
    if (!topics.length) return null

    const recent = await recentBodies(200)
    const lastTopic = recent.find((row) => row.topic)?.topic
    const index = topics.findIndex((item) => (item.name || item.topic) === lastTopic)
    const next = topics[(index + 1) % topics.length]
    const template = next.body || pickTemplate(settings.templates, next.name, '{topic} — see asehanta.com')
    return {
      body: render(template, { topic: next.name || next.topic || '', ...(next.vars || {}) }),
      topic: next.name || next.topic || 'round_robin',
    }
  }

  async function hybridBody(settings) {
    const options = []
    if (settings.templates?.stats !== '') options.push('stats')
    if (Array.isArray(settings.random_pool) && settings.random_pool.length) options.push('random')
    if (Array.isArray(settings.topics) && settings.topics.length) options.push('round_robin')
    if (!options.length) return statsBody(settings)
    const choice = options[Math.floor(Math.random() * options.length)]
    if (choice === 'stats') return statsBody(settings)
    if (choice === 'random') return randomBody(settings)
    return roundRobinBody(settings)
  }

  /** Build the next scheduled status, or null when auto/off/event-only. */
  async function nextScheduled() {
    const settings = await read()
    if (settings.mode === 'off' || settings.mode === 'auto' || settings.mode === 'event') return null
    if (inQuietHours(settings.quiet_hours)) return null

    if (settings.mode === 'stats') return statsBody(settings)
    if (settings.mode === 'random') return randomBody(settings)
    if (settings.mode === 'round_robin') return roundRobinBody(settings)
    if (settings.mode === 'hybrid') return hybridBody(settings)
    return null
  }

  /**
   * Poll for houses that appeared or were released since the last event tick.
   * Returns ready-to-queue drafts; it never sends directly.
   */
  async function pendingEvents() {
    const settings = await read()
    const hooks = settings.event_hooks || {}
    if (!hooks.new_listing && !hooks.released && !hooks.paid && !hooks.booking_confirmed) return []

    const since = settings.last_event_at || new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const until = new Date().toISOString()
    const drafts = []

    if (hooks.new_listing) {
      const { data, error } = await supabase
        .from('listings')
        .select('id,title,rent,price,location,status,created_at')
        .eq('status', 'published')
        .gte('created_at', since)
        .lt('created_at', until)
        .order('created_at', { ascending: true })
        .limit(10)
      if (!error) {
        const template = pickTemplate(settings.templates, 'new_listing', 'New house: {title} — {location} · {rent}\nSee it on asehanta.com')
        for (const row of data || []) {
          drafts.push({
            body: render(template, { title: row.title || 'House', location: row.location || '', rent: money(row.rent || row.price) }),
            topic: 'new_listing',
            kind: 'event',
            meta: { listing_id: row.id },
          })
        }
      }
    }

    if (hooks.released) {
      const { data, error } = await supabase
        .from('listings')
        .select('id,title,rent,price,location,released_at')
        .gte('released_at', since)
        .lt('released_at', until)
        .order('released_at', { ascending: true })
        .limit(10)
      if (!error) {
        const template = pickTemplate(settings.templates, 'released', 'Released 🎉 {title} — {location} · {rent}\nGrab it on asehanta.com')
        for (const row of data || []) {
          drafts.push({
            body: render(template, { title: row.title || 'House', location: row.location || '', rent: money(row.rent || row.price) }),
            topic: 'released',
            kind: 'event',
            meta: { listing_id: row.id },
          })
        }
      }
    }

    if (drafts.length) await write({ last_event_at: until }, 'worker')
    return drafts
  }

  return {
    read,
    write,
    record,
    nextScheduled,
    pendingEvents,
    recentBodies,
    settings: () => cache,
  }
}
