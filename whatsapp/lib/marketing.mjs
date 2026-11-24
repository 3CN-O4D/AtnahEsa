/**
 * WhatsApp marketing: status updates and group posts.
 *
 * The worker owns delivery because only it holds the socket. Drafts, approval
 * and wording live in the Next.js app; this module only:
 *
 *   1. discovers groups and stores them (disabled) for the admin panel,
 *   2. asks the app for a new AI-written draft on the configured cadence,
 *   3. sends approved, due rows to status or to an enabled group,
 *   4. composes a branded card from the real listing photo — never a fake
 *      house — and records the result.
 *
 * Rate limits are deliberate. Group blasting is the fastest way to lose a
 * WhatsApp number, so a group must be enabled by an admin, has its own
 * cadence, and the whole account has a daily cap.
 */

import sharp from 'sharp'
import { recordActivity } from './activity.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const STATUS_MAX_RECIPIENTS = 3000
const LISTING_DAILY_CAP = 2

const digits = (value) => String(value ?? '').replace(/\D/g, '')
/*
 * Admin numbers are loaded from profiles after the worker starts. A plain array
 * passed at construction time would stay empty forever, so callers may pass a
 * getter and every use resolves the latest value.
 */
const normaliseAdminNumbers = (value) =>
  (typeof value === 'function' ? value() : Array.isArray(value) ? value : [])
    .map(digits)
    .filter(Boolean)
const nowIso = () => new Date().toISOString()
// WhatsApp statuses vanish from a phone after 24 hours. Queue rows get the same
// lifetime so an old approved draft is never posted days later.
const statusExpiresAt = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrap(text, maxChars, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    if (line && (line + ' ' + word).length > maxChars) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line && lines.length < maxLines) lines.push(line)

  if (lines.length === maxLines) {
    const consumed = lines.join(' ').length
    if (consumed < String(text ?? '').length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…'
    }
  }
  return lines
}

async function fetchBuffer(url, timeout = 15000) {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' })
    if (!res.ok) return null
    const type = String(res.headers.get('content-type') || '')
    if (!type.startsWith('image/') && !type.includes('octet-stream')) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return buffer.length > 1000 ? buffer : null
  } catch {
    return null
  }
}

function gradientSvg(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.30" stop-color="#04110d" stop-opacity="0.02"/>
        <stop offset="0.55" stop-color="#04110d" stop-opacity="0.52"/>
        <stop offset="0.78" stop-color="#04110d" stop-opacity="0.93"/>
        <stop offset="1" stop-color="#04110d" stop-opacity="0.99"/>
      </linearGradient>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#10b981"/>
        <stop offset="1" stop-color="#0ea5a4"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#fade)"/>
    <rect x="0" y="0" width="${width}" height="10" fill="url(#brand)"/>
  </svg>`)
}

function cardSvg({ width, height, title, location, rent, cta, footer, brand = 'ASEHANTA' }) {
  const margin = Math.round(width * 0.065)
  const tall = height / width > 1.5
  const titleSize = tall ? 62 : 58
  const bodySize = tall ? 36 : 34
  const rentSize = tall ? 52 : 48
  const ctaSize = tall ? 30 : 29
  const titleLines = wrap(title, tall ? 24 : 26, 3)

  let y = Math.round(height * (tall ? 0.56 : 0.53))
  const parts = []

  parts.push(
    `<rect x="${margin}" y="${Math.round(height * 0.055)}" rx="999" width="${brand.length * (tall ? 26 : 24) + 58}" height="${tall ? 66 : 62}" fill="#10b981" fill-opacity="0.94"/>`,
    `<text x="${margin + (tall ? 29 : 27)}" y="${Math.round(height * 0.055) + (tall ? 44 : 41)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${tall ? 28 : 26}" font-weight="bold" fill="#04110d" letter-spacing="1">${xml(brand)}</text>`
  )

  for (const line of titleLines) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="bold" fill="#ffffff">${xml(line)}</text>`
    )
    y += Math.round(titleSize * 1.18)
  }

  y += Math.round(titleSize * 0.12)
  if (location) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${bodySize}" fill="#d1fae5">${xml(location)}</text>`
    )
    y += Math.round(bodySize * 1.55)
  }

  if (rent) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${rentSize}" font-weight="bold" fill="#34d399">${xml(rent)}</text>`
    )
    y += Math.round(rentSize * 1.5)
  }

  if (cta) {
    parts.push(
      `<text x="${margin}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${ctaSize}" fill="#e5e7eb">${xml(cta)}</text>`
    )
  }

  parts.push(
    `<text x="${margin}" y="${height - Math.round(height * 0.045)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${tall ? 28 : 26}" font-weight="bold" fill="#a7f3d0">${xml(footer)}</text>`
  )

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  )
}

function fallbackBackground(width, height) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#022c22"/>
        <stop offset="0.55" stop-color="#064e3b"/>
        <stop offset="1" stop-color="#0f766e"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.78" cy="0.18" r="0.55">
        <stop offset="0" stop-color="#34d399" stop-opacity="0.45"/>
        <stop offset="1" stop-color="#34d399" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
  </svg>`)
}

function rentLabel(listing) {
  if (listing?.rent) return `KSh ${Number(listing.rent).toLocaleString('en-KE')}/month`
  if (listing?.price) return `KSh ${Number(listing.price).toLocaleString('en-KE')} booking fee`
  return null
}

export async function composeMarketingCard({ listing = null, tall = false, headline = null, subline = null }) {
  const width = 1080
  const height = tall ? 1920 : 1350
  const photoUrl = Array.isArray(listing?.images) ? listing.images.find(Boolean) : null
  const photo = await fetchBuffer(photoUrl)

  let base
  if (photo) {
    base = sharp(photo)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 0.92 })
  } else {
    base = sharp(fallbackBackground(width, height))
  }

  const title = headline || listing?.title || 'Find your next home in Eldoret'
  const location =
    subline ||
    listing?.descriptive_location ||
    listing?.location ||
    (listing ? null : 'Verified houses · Movers · WiFi')

  const rent = listing ? rentLabel(listing) : null
  const cta = listing ? 'Book a viewing on asehanta.com' : 'Join AseHanta today'

  const svg = cardSvg({
    width,
    height,
    title,
    location,
    rent,
    cta,
    footer: 'asehanta.com',
    brand: 'ASEHANTA',
  })

  return base
    .composite([{ input: gradientSvg(width, height) }, { input: svg }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}

let lastGroupSyncAt = 0
let groupSyncInFlight = null
const GROUP_SYNC_COOLDOWN_MS = 30 * 60 * 1000

export async function syncGroups(sock, supabase, log = console, force = false) {
  if (!sock?.groupFetchAllParticipating) return 0

  // A reconnect or a burst of membership events must not trigger a fresh
  // `groupFetchAllParticipating()` each time — WhatsApp rate-limits that call
  // and can ban the number. Admin-requested syncs bypass the cooldown.
  const age = Date.now() - lastGroupSyncAt
  if (!force && age < GROUP_SYNC_COOLDOWN_MS) {
    log.log?.(`[marketing] group discovery skipped (last sync ${Math.round(age / 1000)}s ago)`)
    return 0
  }
  if (groupSyncInFlight) return groupSyncInFlight

  groupSyncInFlight = (async () => {
    lastGroupSyncAt = Date.now()
    const count = await syncGroupsNow(sock, supabase, log)
    return count
  })()

  try {
    return await groupSyncInFlight
  } finally {
    groupSyncInFlight = null
  }
}

async function syncGroupsNow(sock, supabase, log) {
  try {
    const groups = await sock.groupFetchAllParticipating()
    const rows = Object.values(groups ?? {}).map((group) => ({
      jid: group.id,
      name: group.subject || 'WhatsApp group',
      member_count: Array.isArray(group.participants) ? group.participants.length : null,
      updated_at: nowIso(),
    }))

    if (!rows.length) return 0

    const { error } = await supabase
      .from('whatsapp_marketing_groups')
      .upsert(rows, { onConflict: 'jid' })
    if (error) throw new Error(error.message)

    log.log?.(`[marketing] discovered ${rows.length} groups`)
    return rows.length
  } catch (error) {
    log.error?.('[marketing] group discovery failed:', error?.message ?? error)
    return 0
  }
}

export async function statusRecipients(supabase, { ownPhone, adminNumbers = [], blocklist = [] } = {}) {
  const phones = new Set()
  const blocked = new Set(blocklist.map(digits))

  const [{ data: sessions }, { data: outbox }] = await Promise.all([
    supabase
      .from('whatsapp_sessions')
      .select('phone')
      .not('phone', 'is', null)
      .gte('updated_at', hoursAgo(24 * 120))
      .limit(STATUS_MAX_RECIPIENTS),
    supabase
      .from('whatsapp_outbox')
      .select('phone')
      .eq('status', 'sent')
      .gte('created_at', hoursAgo(24 * 120))
      .limit(STATUS_MAX_RECIPIENTS),
  ])

  for (const row of [...(sessions ?? []), ...(outbox ?? [])]) {
    const phone = digits(row.phone)
    if (phone && !blocked.has(phone)) phones.add(phone)
  }
  for (const phone of normaliseAdminNumbers(adminNumbers)) {
    const clean = digits(phone)
    if (clean && !blocked.has(clean)) phones.add(clean)
  }

  const own = digits(typeof ownPhone === 'function' ? ownPhone() : ownPhone)
  if (own) phones.delete(own)

  return [...phones].slice(0, STATUS_MAX_RECIPIENTS).map((phone) => `${phone}@s.whatsapp.net`)
}

async function listingFor(supabase, id) {
  if (!id) return null
  const { data } = await supabase
    .from('listings')
    .select('id, title, rent, price, location, descriptive_location, house_type, images, status, vacancy')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

async function claim(supabase, row) {
  const { data, error } = await supabase
    .from('whatsapp_marketing')
    .update({ status: 'sending', updated_at: nowIso() })
    .eq('id', row.id)
    .eq('status', 'approved')
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[marketing] claim failed:', error.message)
    return null
  }
  return data ?? null
}

async function mark(supabase, id, patch) {
  const { error } = await supabase
    .from('whatsapp_marketing')
    .update({ ...patch, updated_at: nowIso() })
    .eq('id', id)
  if (error) console.error('[marketing] update failed:', error.message)
}

export async function sendMarketingRow({ sock, supabase, row, control, status = null, ownPhone, adminNumbers, log = console }) {
  const claimed = await claim(supabase, row)
  if (!claimed) return false

  // A queued status that outlived its TTL must never reach WhatsApp.
  if (claimed.expires_at && Date.parse(claimed.expires_at) <= Date.now()) {
    await mark(supabase, claimed.id, {
      status: 'skipped',
      error: 'status expired before it was sent',
    })
    log.warn?.(`[marketing] skipped expired ${claimed.channel} post ${claimed.id}`)
    return false
  }

  try {
    const listing = await listingFor(supabase, claimed.listing_id)

    /*
     * Self-activity guard: cap a house at two posts per day per channel. The
     * picker rotates houses so consecutive posts differ; this protects against
     * drafts queued before that rule existed or a burst of retries.
     */
    if (claimed.listing_id) {
      let usage = supabase
        .from('whatsapp_marketing')
        .select('id', { count: 'exact', head: true })
        .eq('channel', claimed.channel)
        .eq('status', 'sent')
        .eq('listing_id', claimed.listing_id)
        .gte('sent_at', hoursAgo(24))

      if (claimed.channel === 'group') usage = usage.eq('target_jid', claimed.target_jid)

      const { count } = await usage

      if ((count ?? 0) >= LISTING_DAILY_CAP) {
        await mark(supabase, claimed.id, {
          status: 'skipped',
          error: 'same house already posted twice in the last 24 hours',
        })
        await recordActivity(
          supabase,
          {
            kind: 'marketing_skipped_duplicate',
            subject: claimed.listing_id,
            detail: { marketing_id: claimed.id, channel: claimed.channel, window_hours: 24 },
          },
          log
        )
        log.warn?.(`[marketing] skipped duplicate listing ${claimed.listing_id}`)
        return false
      }
    }

    /*
     * Second guard: never send the exact same copy again. This catches drafts
     * queued before the rotation rule existed, retries, and brand posts that
     * have no listing id. One status copy per day; one copy per group per day.
     */
    let recentCopies = supabase
      .from('whatsapp_marketing')
      .select('body, target_jid')
      .eq('channel', claimed.channel)
      .eq('status', 'sent')
      .gte('sent_at', hoursAgo(24))
      .order('sent_at', { ascending: false })
      .limit(100)

    if (claimed.channel === 'group') recentCopies = recentCopies.eq('target_jid', claimed.target_jid)

    const { data: copyRows } = await recentCopies
    if ((copyRows ?? []).some((row) => row.body === claimed.body)) {
      await mark(supabase, claimed.id, {
        status: 'skipped',
        error: 'same message already posted in the last 24 hours',
      })
      await recordActivity(
        supabase,
        {
          kind: 'marketing_skipped_duplicate',
          subject: claimed.listing_id || claimed.target_jid || claimed.id,
          detail: { marketing_id: claimed.id, channel: claimed.channel, reason: 'same_copy' },
        },
        log
      )
      log.warn?.(`[marketing] skipped duplicate ${claimed.channel} copy`)
      return false
    }

    const tall = claimed.channel === 'status'
    const image = claimed.image_url
      ? (await fetchBuffer(claimed.image_url)) ||
        (await composeMarketingCard({ listing, tall, headline: claimed.meta?.headline, subline: claimed.meta?.subline }))
      : await composeMarketingCard({
          listing,
          tall,
          headline: claimed.meta?.headline,
          subline: claimed.meta?.subline,
        })

    const content = { image, caption: String(claimed.body || '').slice(0, 3000) }

    if (claimed.channel === 'status') {
      const snap = await control.read()
      const recipients = await statusRecipients(supabase, {
        ownPhone,
        adminNumbers: normaliseAdminNumbers(adminNumbers),
        blocklist: snap.blocklist,
      })

      if (!recipients.length) throw new Error('no status recipients yet')

      await sock.sendMessage('status@broadcast', content, {
        statusJidList: recipients,
        // Baileys' documented status form; harmless on versions that detect
        // status posts by the broadcast JID alone.
        broadcast: true,
      })
    } else {
      if (!claimed.target_jid) throw new Error('group post has no target')

      const { data: group } = await supabase
        .from('whatsapp_marketing_groups')
        .select('jid, enabled')
        .eq('jid', claimed.target_jid)
        .maybeSingle()

      if (!group?.enabled) {
        await mark(supabase, claimed.id, { status: 'skipped', error: 'group is disabled' })
        return false
      }

      await sock.sendMessage(claimed.target_jid, content)

      await supabase
        .from('whatsapp_marketing_groups')
        .update({ last_posted_at: nowIso(), updated_at: nowIso() })
        .eq('jid', claimed.target_jid)
    }

    await mark(supabase, claimed.id, { status: 'sent', sent_at: nowIso(), error: null })

    // Keep the Statuses history/duplicate window in sync with what actually
    // reached WhatsApp. Previously only drafts were recorded, so history was
    // empty even though activity logs showed sent statuses. `kind` must stay
    // inside the schema's scheduled|event|manual check constraint.
    if (claimed.channel === 'status' && status?.record) {
      await status.record(claimed.body, {
        mode: 'sent',
        topic: claimed.template || 'status',
        kind: 'scheduled',
        meta: {
          marketing_id: claimed.id,
          listing_id: claimed.listing_id ?? null,
          scopes: claimed.meta?.scopes || [],
          delivered: true,
        },
      })
    }

    // Base the next cadence on the actual send, not on when the draft was made.
    if (claimed.channel === 'status') await control.touchStatus('status')

    await recordActivity(
      supabase,
      {
        kind: claimed.channel === 'status' ? 'marketing_status' : 'marketing_group',
        subject: claimed.listing_id || claimed.target_jid || claimed.id,
        detail: {
          marketing_id: claimed.id,
          channel: claimed.channel,
          target_jid: claimed.target_jid,
          listing_title: listing?.title ?? null,
          headline: claimed.meta?.headline ?? null,
        },
      },
      log
    )
    log.log?.(`[marketing] sent ${claimed.channel} post ${claimed.id}`)
    return true
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 500)
    await mark(supabase, claimed.id, { status: 'failed', error: message })
    await recordActivity(
      supabase,
      {
        kind: 'marketing_failed',
        subject: claimed.listing_id || claimed.target_jid || claimed.id,
        detail: { marketing_id: claimed.id, channel: claimed.channel, error: message },
      },
      log
    )
    log.error?.(`[marketing] ${claimed.channel} post failed:`, message)
    return false
  }
}

async function requestDraft({ apiUrl, secret, payload }) {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/whatsapp/marketing/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bridge-secret': secret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || `draft endpoint returned ${res.status}`)
  }
  if (!data?.draft) {
    if (data?.skipped) return data
    throw new Error(data?.error || 'draft endpoint returned no draft')
  }
  return data
}

export function createMarketing({
  supabase,
  control,
  status = null,
  apiUrl,
  secret,
  ownPhone,
  adminNumbers = [],
  sendText,
  log = console,
}) {
  const getAdminNumbers = () => normaliseAdminNumbers(adminNumbers)
  let timer = null
  let busy = false

  function start(sock) {
    if (sock) currentSock = sock
    if (timer) return
    timer = setInterval(() => void tick(), 60_000)
    void tick(sock)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  async function pending(channel, targetJid = null) {
    let query = supabase
      .from('whatsapp_marketing')
      .select('id', { count: 'exact', head: true })
      .eq('channel', channel)
      .in('status', ['draft', 'approved', 'scheduled', 'sending'])

    if (targetJid) query = query.eq('target_jid', targetJid)
    const { count } = await query
    return count ?? 0
  }

  async function sentToday(channel) {
    let query = supabase
      .from('whatsapp_marketing')
      .select('id', { count: 'exact', head: true })
      .eq('channel', channel)
      .eq('status', 'sent')
      .gte('sent_at', hoursAgo(24))

    const { count } = await query
    return count ?? 0
  }

  /*
   * WhatsApp deletes statuses from the phone after 24 hours. Keep the queue in
   * step with that so the admin panel and the no-repeat history do not fill up
   * with posts nobody can see any more.
   */
  async function cleanupExpiredStatuses() {
    const cutoff = Date.now() - DAY_MS
    const { data, error } = await supabase
      .from('whatsapp_marketing')
      .select('id, expires_at, sent_at')
      .eq('channel', 'status')
      .limit(200)

    if (error) {
      log.warn?.('[marketing] status expiry cleanup failed:', error.message)
      return
    }

    const ids = (data ?? [])
      .filter((row) => {
        const explicit = row.expires_at ? Date.parse(row.expires_at) : null
        if (explicit !== null && !Number.isNaN(explicit)) return explicit <= Date.now()
        const sent = row.sent_at ? Date.parse(row.sent_at) : null
        return sent !== null && !Number.isNaN(sent) && sent <= cutoff
      })
      .map((row) => row.id)

    if (!ids.length) return

    await supabase.from('whatsapp_marketing').delete().in('id', ids)
    for (const id of ids) {
      await supabase.from('whatsapp_status_history').delete().eq('meta->>marketing_id', id)
    }
    log.log?.(`[marketing] removed ${ids.length} expired status(es)`)
  }

  /*
   * If the worker dies between claim() and mark(), a row can stay `sending`
   * forever and pending() then blocks every future status/group draft. Recover
   * rows that have been stuck for more than 15 minutes.
   */
  async function recoverStuckRows() {
    const { data, error } = await supabase
      .from('whatsapp_marketing')
      .select('id')
      .eq('status', 'sending')
      .lt('updated_at', hoursAgo(0.25))
      .limit(50)
    if (error) {
      log.warn?.('[marketing] stuck-row recovery failed:', error.message)
      return
    }
    for (const row of data ?? []) {
      await mark(supabase, row.id, {
        status: 'failed',
        error: 'recovered from an interrupted send',
      })
      log.warn?.(`[marketing] recovered stuck post ${row.id}`)
    }
  }

  async function notifyDraft(draft) {
    if (!sendText) return
    const where = draft.channel === 'group' ? `group ${draft.target_jid}` : 'WhatsApp status'
    const text = [
      `📣 *New marketing draft* (${where})`,
      '',
      String(draft.body || '').slice(0, 700),
      '',
      'Approve or edit it in the admin panel:',
      'https://www.asehanta.com/admin/whatsapp',
    ].join('\n')

    for (const number of getAdminNumbers()) {
      try {
        await sendText(`${number}@s.whatsapp.net`, text)
      } catch (error) {
        log.error?.(`[marketing] draft notice to ${number} failed:`, error?.message ?? error)
      }
    }
  }

  /** Queue event-driven statuses (new/released houses) without spamming. */
  async function generateEvents(settings, snap = null) {
    if (!status) return
    if (status.isQuiet(settings)) return
    if (snap && tooSoon(snap.last_status_at, settings.interval_minutes)) return
    if ((await pending('status')) > 0) return

    const remaining = Number(settings.daily_limit) - (await sentToday('status'))
    if (remaining <= 0) return

    const drafts = await status.pendingEvents(settings, Math.min(3, remaining))
    let queued = 0
    for (const draft of drafts) {
      if (queued >= Math.min(3, remaining)) break
      if ((await sentToday('status')) >= settings.daily_limit) break
      if (status.isQuiet(settings)) break
      const { data, error } = await supabase
        .from('whatsapp_marketing')
        .insert({
          channel: 'status',
          body: draft.body,
          template: draft.topic,
          status: settings.require_approval ? 'draft' : 'approved',
          scheduled_for: nowIso(),
          expires_at: statusExpiresAt(),
          meta: { source: 'status_event', scopes: settings._scopes || [], ...(draft.meta || {}) },
        })
        .select('*')
        .maybeSingle()
      if (error) {
        log.error?.('[marketing] event status queue failed:', error.message)
        continue
      }
      queued += 1
      await status.record(draft.body, {
        mode: 'event',
        topic: draft.topic,
        kind: 'event',
        meta: { ...(draft.meta || {}), marketing_id: data?.id },
      })
      if (data?.status === 'draft') await notifyDraft(data)
    }
    if (queued) await control.touchStatus('status')
  }

  /** Queue a body from the new status mode (stats/random/round robin/hybrid). */
  async function generateConfiguredStatus(snap, settings) {
    if (status.isQuiet(settings)) return false
    if (tooSoon(snap.last_status_at, settings.interval_minutes)) return false
    if ((await sentToday('status')) >= settings.daily_limit) return false
    if ((await pending('status')) > 0) return false

    const next = await status.nextScheduled({ scope: 'status', target: 'status' })
    if (!next?.body) {
      log.log?.('[marketing] status mode produced no body')
      await control.touchStatus('marketing')
      return false
    }
    const { data, error } = await supabase
      .from('whatsapp_marketing')
      .insert({
        channel: 'status',
        body: next.body,
        template: next.topic,
        status: settings.require_approval ? 'draft' : 'approved',
        scheduled_for: nowIso(),
        expires_at: statusExpiresAt(),
        meta: { source: 'status_mode', mode: settings.mode, scopes: settings._scopes || [] },
      })
      .select('*')
      .maybeSingle()
    if (error) {
      log.error?.('[marketing] status queue failed:', error.message)
      return false
    }
    await status.record(next.body, {
      mode: settings.mode,
      topic: next.topic,
      meta: { marketing_id: data?.id, scopes: settings._scopes || [] },
    })
    await control.touchStatus('status')
    if (data?.status === 'draft') await notifyDraft(data)
    else if (data?.status === 'approved') {
      await sendMarketingRow({ sock: currentSock, supabase, row: data, control, status, ownPhone, adminNumbers: getAdminNumbers(), log })
    }
    return true
  }

  async function generateStatus(snap) {
    /*
     * `settings` must live outside the `if (status)` block: auto mode falls
     * through to the legacy generator below, and referencing a block-scoped
     * const there threw ReferenceError, aborting both status and group ticks.
     */
    const settings = status ? await status.settingsFor({ scope: 'status', target: 'status' }) : null
    if (settings?.mode === 'off') return

    if (settings?.mode === 'event') {
      await generateEvents(settings, snap)
      return
    }

    if (settings && settings.mode !== 'auto') {
      const generated = await generateConfiguredStatus(snap, settings)
      if (!generated) await generateEvents(settings, snap)
      return
    }

    // The Statuses tab is the source of truth for status cadence/approval;
    // the legacy control row is only a fallback for deployments without it.
    const effective = settings || {
      interval_minutes: snap.status_interval_minutes,
      daily_limit: snap.status_daily_limit,
      require_approval: false,
      _scopes: [],
    }

    if (status?.isQuiet(effective)) return
    if (tooSoon(snap.last_status_at, effective.interval_minutes)) return
    if ((await sentToday('status')) >= effective.daily_limit) return
    if ((await pending('status')) > 0) return

    let generated = false
    try {
      const data = await requestDraft({
        apiUrl,
        secret,
        log,
        payload: { channel: 'status', topic: 'auto', auto: true },
      })
      await control.touchStatus('marketing')
      if (!data.draft) {
        log.log?.(`[marketing] status skipped: ${data.skipped || 'no available house'}`)
        return
      }
      generated = true
      if (status) {
        const want = effective.require_approval ? 'draft' : 'approved'
        if (data.draft.status !== want) {
          await mark(supabase, data.draft.id, {
            status: want,
            approved_by: effective.require_approval ? null : 'worker:status',
          })
          data.draft.status = want
        }
        await mark(supabase, data.draft.id, { expires_at: statusExpiresAt() })
        data.draft.expires_at = statusExpiresAt()
      }
      if (data.draft.status === 'draft') await notifyDraft(data.draft)
      else if (data.draft.status === 'approved') {
        await sendMarketingRow({ sock: currentSock, supabase, row: data.draft, control, status, ownPhone, adminNumbers: getAdminNumbers(), log })
      }
    } catch (error) {
      log.error?.('[marketing] status draft failed:', error?.message ?? error)
      await control.touchStatus('marketing')
    }
    if (!generated && status) await generateEvents(effective, snap)
  }

  async function generateGroup(snap) {
    if (tooSoon(snap.last_group_at, snap.group_interval_minutes)) return
    if ((await sentToday('group')) >= snap.group_daily_limit) return

    const { data: groups } = await supabase
      .from('whatsapp_marketing_groups')
      .select('jid, name, cadence_minutes, last_posted_at')
      .eq('enabled', true)
      .order('last_posted_at', { ascending: true, nullsFirst: true })
      .limit(10)

    let effective = null
    const due = (groups ?? []).find((group) => {
      const cadence = Number(group.cadence_minutes) || Number(snap.group_interval_minutes) || 50
      return !tooSoon(group.last_posted_at, Math.max(cadence, 1))
    })
    if (!due) return

    // A group-level status override can pause that group entirely or replace
    // its cadence / quiet hours / approval rule.
    if (status?.settingsFor) {
      effective = await status.settingsFor({ scope: 'group', target: due.jid })
      if (effective.mode === 'off' || status.isQuiet(effective)) return
      const overrideMinutes = Number(effective.interval_minutes)
      if (Number.isFinite(overrideMinutes) && overrideMinutes > 0) {
        const { error } = await supabase
          .from('whatsapp_marketing_groups')
          .update({ cadence_minutes: overrideMinutes, updated_at: nowIso() })
          .eq('jid', due.jid)
        if (error) log.warn?.('[marketing] group override save failed:', error.message)
        if (tooSoon(due.last_posted_at, overrideMinutes)) return
      }
    }
    if ((await pending('group', due.jid)) > 0) return

    try {
      const data = await requestDraft({
        apiUrl,
        secret,
        log,
        payload: { channel: 'group', target_jid: due.jid, topic: 'auto', auto: true },
      })
      await control.touchGroup('marketing')
      if (!data.draft) {
        log.log?.(`[marketing] group post skipped: ${data.skipped || 'no available house'}`)
        return
      }
      if (effective && typeof effective.require_approval === 'boolean') {
        const want = effective.require_approval ? 'draft' : 'approved'
        if (data.draft.status !== want) {
          await mark(supabase, data.draft.id, {
            status: want,
            approved_by: effective.require_approval ? null : 'worker:override',
          })
          data.draft.status = want
        }
      }
      if (data.draft.status === 'draft') await notifyDraft(data.draft)
      else if (data.draft.status === 'approved') {
        await sendMarketingRow({ sock: currentSock, supabase, row: data.draft, control, status, ownPhone, adminNumbers: getAdminNumbers(), log })
      }
    } catch (error) {
      log.error?.('[marketing] group draft failed:', error?.message ?? error)
      await control.touchGroup('marketing')
    }
  }

  let currentSock = null

  async function tick(sock = currentSock) {
    currentSock = sock
    if (!sock || busy) return

    busy = true
    try {
      await cleanupExpiredStatuses()
      await recoverStuckRows()
      const snap = await control.read()
      if (!snap.marketing_enabled) return

      const { data: due } = await supabase
        .from('whatsapp_marketing')
        .select('*')
        .eq('status', 'approved')
        .lte('scheduled_for', nowIso())
        .order('scheduled_for', { ascending: true })
        .limit(3)

      for (const row of due ?? []) {
        await sendMarketingRow({ sock, supabase, row, control, status, ownPhone, adminNumbers: getAdminNumbers(), log })
      }

      await generateStatus(snap)
      await generateGroup(snap)
    } catch (error) {
      log.error?.('[marketing] tick failed:', error?.message ?? error)
    } finally {
      busy = false
    }
  }

  return { start, stop, tick }
}

function tooSoon(lastAt, intervalMinutes) {
  if (!lastAt) return false
  const last = new Date(lastAt).getTime()
  if (Number.isNaN(last)) return false
  return Date.now() - last < Math.max(Number(intervalMinutes) || 0, 1) * 60 * 1000
}
