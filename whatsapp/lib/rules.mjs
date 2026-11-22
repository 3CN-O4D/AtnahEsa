import { digits } from './control.mjs'

/**
 * Reply rules for Ase.
 *
 * The control row (`whatsapp_bot_control`) decides WHO may talk to the bot.
 * This module decides WHEN the bot should answer. All settings live in a JSON
 * column so new rules can be added without another migration; missing keys
 * fall back to RULE_DEFAULTS, which are deliberately conservative.
 */

const CACHE_MS = 5000
const NAIROBI = 'Africa/Nairobi'

export const RULE_DEFAULTS = {
  // The rule the owner asked for: never answer when Ase spoke last.
  last_speaker_guard: true,
  greet_once: true,
  require_intent: false,
  intent_keywords: [],
  quiet_hours: { enabled: false, start: '22:00', end: '06:00', urgent_exempt: true },
  typing_delay_seconds: 0,
  per_chat_rate_limit: { enabled: true, max_replies: 8, window_minutes: 60 },
  global_rate_limit: { enabled: true, max_per_hour: 120 },
  ignore_forwarded: true,
  ignore_status_replies: true,
  keyword_allowlist: [],
  keyword_blocklist: [],
  handoff_after_misses: 0,
  // Group messages are ignored unless this is explicitly enabled.
  groups_enabled: false,
  groups_require_mention: true,
  group_last_speaker_guard: true,
  group_silent: false,
  enabled_groups_only: true,
  reply_probability: 100,
  circuit_breaker: { enabled: true, max_errors: 5 },
  dry_run: false,
}

const URGENT_RE = /\b(urgent|emergency|help|police|ambulance|fire)\b/i

function mergeDefaults(settings) {
  const merged = { ...RULE_DEFAULTS, ...(settings || {}) }
  for (const key of Object.keys(RULE_DEFAULTS)) {
    const value = RULE_DEFAULTS[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = { ...value, ...(settings?.[key] || {}) }
    }
  }
  return merged
}

function keywordList(value) {
  return (Array.isArray(value) ? value : String(value || '').split(','))
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
}

function minutesFromHHMM(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
  if (!match) return fallback
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (hours > 23 || mins > 59) return fallback
  return hours * 60 + mins
}

function nairobiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0)
  return hour * 60 + minute
}

function inQuietHours(quiet, text) {
  if (!quiet?.enabled) return false
  if (quiet.urgent_exempt && URGENT_RE.test(text || '')) return false
  const now = nairobiParts()
  const start = minutesFromHHMM(quiet.start, 22 * 60)
  const end = minutesFromHHMM(quiet.end, 6 * 60)
  if (start === end) return false
  return start < end ? now >= start && now < end : now >= start || now < end
}

function isForwarded(message) {
  const m = message?.message || {}
  const context = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo || m.documentMessage?.contextInfo || m.conversationContextInfo
  return Boolean(
    m.forwarded_chat_info ||
    context?.isForwarded ||
    (Number(context?.forwardingScore || 0) > 0)
  )
}

function botMentioned(message, ownPhone, botName = 'ase') {
  const text = String(
    message?.message?.extendedTextMessage?.text ||
    message?.message?.conversation ||
    ''
  ).toLowerCase()
  if (ownPhone && text.includes(String(ownPhone).slice(-6))) return true
  const names = [botName, 'asehanta', 'ase', 'bot']
  return names.some((name) => new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, 'i').test(text))
}

function mergePatch(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  const next = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && next[key] && typeof next[key] === 'object' && !Array.isArray(next[key])) {
      next[key] = { ...next[key], ...value }
    } else {
      next[key] = value
    }
  }
  return next
}

export function createRules(supabase, { log = console } = {}) {
  let cache = mergeDefaults(null)
  let cacheAt = 0
  let overrideCache = { at: 0, rows: [] }

  // In-memory signals are intentionally small: they only need to cover the
  // current process lifetime, and the DB transcript is the durable fallback.
  const outgoing = new Map()
  const chatCounts = new Map()
  let greeted = new Set()
  let globalCount = 0
  let globalWindowAt = Date.now()
  let errorStreak = 0

  async function read(force = false) {
    if (!force && Date.now() - cacheAt < CACHE_MS) return cache
    const { data, error } = await supabase
      .from('whatsapp_bot_rules')
      .select('settings')
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    cache = mergeDefaults(data?.settings)
    cacheAt = Date.now()
    return cache
  }

  async function write(patch, actor = 'worker') {
    const current = await read(true)
    const next = { ...current, ...(patch || {}) }
    const { error } = await supabase
      .from('whatsapp_bot_rules')
      .update({ settings: next, updated_by: actor, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) throw error
    cache = next
    cacheAt = Date.now()
    return next
  }

  async function readOverrides(force = false) {
    if (!force && Date.now() - overrideCache.at < CACHE_MS) return overrideCache.rows
    const { data, error } = await supabase
      .from('whatsapp_rule_overrides')
      .select('scope, target, settings, enabled')
      .eq('enabled', true)
    if (error) {
      // The override table arrives with the console migration; until then the
      // global rules still work exactly as before.
      log?.warn?.('[rules] overrides unavailable:', error.message)
      overrideCache = { at: Date.now(), rows: [] }
      return []
    }
    overrideCache = { at: Date.now(), rows: data || [] }
    return overrideCache.rows
  }

  /**
   * Global rules first, then the group patch, then the chat patch. Chat wins
   * because it is the most specific. Phone numbers are compared digits-only so
   * LID/PN JIDs and `+254…` targets all match the same person.
   */
  async function settingsFor({ jid = '', phone = '', isGroup = false } = {}) {
    const base = await read()
    const rows = await readOverrides()
    const cleanJid = String(jid || '')
    const cleanPhone = digits(phone || String(jid || '').split('@')[0])
    let next = base
    const scopes = []

    for (const row of rows) {
      const target = String(row.target || '')
      const targetDigits = digits(target)
      if (row.scope === 'group' && isGroup && (target === cleanJid || targetDigits === cleanPhone)) {
        next = mergePatch(next, row.settings)
        scopes.push('group')
      }
    }
    for (const row of rows) {
      const target = String(row.target || '')
      const targetDigits = digits(target)
      const matches = target === cleanJid || (cleanPhone && targetDigits === cleanPhone)
      if (row.scope === 'chat' && matches && !isGroup) {
        next = mergePatch(next, row.settings)
        scopes.push('chat')
      }
    }
    return { ...next, _scopes: scopes }
  }

  function settings() {
    return cache
  }

  function recordOutgoing(jid) {
    if (!jid) return
    outgoing.set(jid, { at: Date.now(), actor: 'assistant' })
    chatCounts.set(jid, (chatCounts.get(jid) || 0) + 1)
    globalCount += 1
    errorStreak = 0
  }

  function recordIncoming(jid) {
    if (!jid) return
    outgoing.set(jid, { at: Date.now(), actor: 'user' })
  }

  function recordError() {
    errorStreak += 1
  }

  function recordSuccess() {
    errorStreak = 0
  }

  function countInWindow(map, key, windowMs) {
    const now = Date.now()
    const value = map.get(key)
    if (!value || now - value.at > windowMs) {
      map.set(key, { at: now, count: 0 })
      return 0
    }
    return value.count
  }

  function bumpWindow(map, key, windowMs) {
    const now = Date.now()
    const value = map.get(key)
    if (!value || now - value.at > windowMs) {
      map.set(key, { at: now, count: 1 })
      return 1
    }
    value.count += 1
    return value.count
  }

  async function lastTranscriptSender(jid, phone) {
    let query = supabase
      .from('whatsapp_messages')
      .select('role, kind, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    if (jid) query = query.eq('wa_jid', jid)
    else if (phone) query = query.eq('phone', digits(phone))
    else return null

    const { data, error } = await query
    if (error || !data?.length) return null
    const row = data[0]
    if (row.kind === 'otp') return null
    return row.role
  }

  /**
   * Decide whether Ase may answer this message.
   *
   * Returns `{ allow, reason, delayMs }`. `reason` is stable enough to show in
   * the activity audit and to explain silence in the admin panel.
   */
  async function gate({
    jid,
    phone,
    text = '',
    isGroup = false,
    message = null,
    ownPhone = '',
    enabledGroupIds = null,
  } = {}) {
    const rules = await settingsFor({ jid, phone, isGroup })
    const deny = (reason) => ({ allow: false, reason, scopes: rules._scopes || [] })

    if (rules.ignore_status_replies && String(message?.key?.remoteJid || '').includes('status')) {
      return deny('status_reply')
    }
    if (rules.ignore_forwarded && isForwarded(message)) return deny('forwarded')

    const lowered = String(text).trim().toLowerCase()
    const blocklist = keywordList(rules.keyword_blocklist)
    if (blocklist.some((word) => lowered.includes(word))) return deny('keyword_block')

    const allowlist = keywordList(rules.keyword_allowlist)
    if (allowlist.length && !allowlist.some((word) => lowered.includes(word))) {
      return deny('keyword_allowlist')
    }

    if (isGroup) {
      if (!rules.groups_enabled) return deny('groups_disabled')
      if (rules.group_silent) return deny('group_silent')
      if (rules.enabled_groups_only && enabledGroupIds && !enabledGroupIds.has(jid)) {
        return deny('group_not_enabled')
      }
      if (rules.groups_require_mention && !botMentioned(message, ownPhone)) {
        return deny('group_not_mentioned')
      }
      if (rules.reply_probability < 100 && Math.random() * 100 > rules.reply_probability) {
        return deny('group_probability')
      }
    }

    if (inQuietHours(rules.quiet_hours, text)) return deny('quiet_hours')

    if (rules.circuit_breaker?.enabled && errorStreak >= Number(rules.circuit_breaker.max_errors || 5)) {
      return deny('circuit_open')
    }

    const windowMs = 60 * 60 * 1000
    if (rules.global_rate_limit?.enabled) {
      if (Date.now() - globalWindowAt > windowMs) {
        globalWindowAt = Date.now()
        globalCount = 0
      }
      if (globalCount >= Number(rules.global_rate_limit.max_per_hour || 120)) {
        return deny('global_rate_limit')
      }
    }
    if (rules.per_chat_rate_limit?.enabled && jid) {
      const window = Math.max(1, Number(rules.per_chat_rate_limit.window_minutes || 60)) * 60 * 1000
      const limit = Number(rules.per_chat_rate_limit.max_replies || 8)
      const count = countInWindow(chatCounts, jid, window)
      if (count >= limit) return deny('chat_rate_limit')
    }

    const guard = isGroup ? rules.group_last_speaker_guard : rules.last_speaker_guard
    if (guard && jid) {
      const last = outgoing.get(jid)
      if (last?.actor === 'assistant') return deny('last_speaker')
      const role = await lastTranscriptSender(jid, phone)
      if (role === 'assistant' || role === 'admin') return deny('last_speaker')
    }

    if (rules.greet_once && jid && greeted.has(jid)) {
      // Only suppress bare greetings; a real question still deserves an answer.
      const greetingOnly = /^(hi|hello|hey|habari|sasa|jambo|good (morning|afternoon|evening))[!.\s]*$/i.test(lowered)
      if (greetingOnly) return deny('already_greeted')
    }
    if (rules.require_intent) {
      const intents = keywordList(rules.intent_keywords)
      if (intents.length && !intents.some((word) => lowered.includes(word))) {
        return deny('no_intent')
      }
    }

    const delayMs = Math.max(0, Number(rules.typing_delay_seconds || 0)) * 1000
    return { allow: true, reason: 'allowed', delayMs }
  }

  /** Called after a reply is actually sent so the next inbound can be gated. */
  function markDelivered({ jid, phone, text = '', isGroup = false } = {}) {
    if (jid) {
      recordOutgoing(jid)
      if (/^(hi|hello|hey|habari|sasa|jambo)\b/i.test(String(text).trim())) greeted.add(jid)
    } else if (phone) {
      recordOutgoing(digits(phone))
    }
    if (isGroup) recordOutgoing(jid)
  }

  async function primeGreeted() {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('wa_jid')
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      log?.warn?.('[rules] could not prime greeted chats:', error.message)
      return
    }
    greeted = new Set((data || []).map((row) => row.wa_jid).filter(Boolean))
  }

  return {
    read,
    write,
    readOverrides,
    settingsFor,
    settings,
    gate,
    markDelivered,
    recordIncoming,
    recordError,
    recordSuccess,
    primeGreeted,
    isDryRun: () => Boolean(settings().dry_run),
    resetCounters: () => {
      outgoing.clear()
      chatCounts.clear()
      globalCount = 0
      errorStreak = 0
    },
  }
}
