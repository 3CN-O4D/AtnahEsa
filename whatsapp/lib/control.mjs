/**
 * WhatsApp bot control, shared by the worker and the admin panel.
 *
 * The singleton row in `whatsapp_bot_control` is the source of truth:
 *
 *   - `mode` pauses every AI reply so a human can take over the inbox.
 *   - `allowlist` (empty = everyone) and `blocklist` are digits-only phones.
 *   - marketing cadence + approval settings are stored there too.
 *
 * The row is read on every message but cached for a few seconds so a busy
 * inbox does not hit Supabase for each bubble. Admin writes refresh the cache
 * immediately.
 */

const CACHE_MS = 5000

export const MODES = ['autonomous', 'regular', 'off']

/** Old rows used `active` / `paused`; map them onto the three-state model. */
export function normaliseMode(mode) {
  if (mode === 'autonomous') return 'autonomous'
  if (mode === 'regular' || mode === 'active') return 'regular'
  if (mode === 'off' || mode === 'paused') return 'off'
  return 'regular'
}

export const isAutonomous = (snap) => normaliseMode(snap?.mode) === 'autonomous'

export const controlDefaults = () => ({
  mode: 'regular',
  allowlist: [],
  blocklist: [],
  marketing_enabled: false,
  require_approval: true,
  // ~2.5h cadence gives the "about every 3 hours" feel while allowing 12/day.
  status_interval_minutes: 150,
  group_interval_minutes: 1440,
  status_daily_limit: 12,
  group_daily_limit: 3,
  last_status_at: null,
  last_group_at: null,
  updated_by: null,
  updated_at: null,
})

export const digits = (value) => String(value ?? '').replace(/\D/g, '')

export function normalizeList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.map(digits).filter(Boolean))]
}

export function createControl(supabase, { seedAllowlist = [], log = console } = {}) {
  let cached = { at: 0, ...controlDefaults() }

  function normalise(row) {
    const defaults = controlDefaults()
    if (!row) return { ...defaults }
    return {
      ...defaults,
      ...row,
      mode: normaliseMode(row.mode),
      allowlist: normalizeList(row.allowlist),
      blocklist: normalizeList(row.blocklist),
      status_interval_minutes: Number(row.status_interval_minutes) || defaults.status_interval_minutes,
      group_interval_minutes: Number(row.group_interval_minutes) || defaults.group_interval_minutes,
      status_daily_limit: Number(row.status_daily_limit) || defaults.status_daily_limit,
      group_daily_limit: Number(row.group_daily_limit) || defaults.group_daily_limit,
    }
  }

  async function read(force = false) {
    if (!force && Date.now() - cached.at < CACHE_MS) return cached

    const { data, error } = await supabase
      .from('whatsapp_bot_control')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      log.error?.('[control] read failed:', error.message)
      return cached
    }

    if (!data) {
      const { data: created } = await supabase
        .from('whatsapp_bot_control')
        .insert({ id: 1 })
        .select('*')
        .maybeSingle()
      cached = { at: Date.now(), ...normalise(created) }
      return cached
    }

    let row = data
    /*
     * Seed the allowlist once from the environment. After an admin edits it,
     * `updated_by` is set and the env value never overwrites their choice.
     */
    if (row.updated_by == null && normalizeList(row.allowlist).length === 0 && seedAllowlist.length) {
      row = await write({ allowlist: normalizeList(seedAllowlist), updated_by: 'env' }, 'seed-allowlist')
    }

    cached = { at: Date.now(), ...normalise(row) }
    return cached
  }

  async function write(patch, actor = 'system') {
    const { data, error } = await supabase
      .from('whatsapp_bot_control')
      .update({ ...patch, updated_by: actor, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('*')
      .maybeSingle()

    if (error) {
      log.error?.('[control] write failed:', error.message)
      throw new Error(error.message)
    }

    cached = { at: Date.now(), ...normalise(data) }
    return data
  }

  async function audit(action, detail = {}, actor = 'system') {
    const { error } = await supabase.from('whatsapp_control_audit').insert({
      actor,
      action,
      detail,
    })
    if (error) log.error?.('[control] audit failed:', error.message)
  }

  async function setMode(mode, actor = 'admin') {
    const next = normaliseMode(mode)
    if (!MODES.includes(next)) throw new Error('mode must be autonomous, regular or off')
    const patch = { mode: next }
    // One state at a time: autonomous means no approvals, regular always asks.
    if (next === 'autonomous') patch.require_approval = false
    if (next === 'regular') patch.require_approval = true
    const row = await write(patch, actor)
    await audit(`mode:${next}`, {}, actor)
    return row
  }

  async function setList(list, values, actor = 'admin') {
    if (!['allowlist', 'blocklist'].includes(list)) throw new Error('unknown list')
    const row = await write({ [list]: normalizeList(values) }, actor)
    await audit(`${list}:set`, { count: normalizeList(values).length }, actor)
    return row
  }

  async function addToList(list, value, actor = 'admin') {
    const phone = digits(value)
    if (!phone) throw new Error('phone is required')
    const snap = await read(true)
    const next = [...new Set([...(snap[list] ?? []), phone])]
    return setList(list, next, actor)
  }

  async function removeFromList(list, value, actor = 'admin') {
    const phone = digits(value)
    const snap = await read(true)
    const next = (snap[list] ?? []).filter((entry) => entry !== phone)
    return setList(list, next, actor)
  }

  /** Turn AI replies on/off for one conversation. Creates the row if needed. */
  async function setChatAI(waJid, phone, enabled, actor = 'admin') {
    const row = {
      wa_jid: waJid,
      phone: phone ? digits(phone) : null,
      ai_enabled: Boolean(enabled),
      handoff_at: null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert(row, { onConflict: 'wa_jid' })
    if (error) throw new Error(error.message)
    await audit(enabled ? 'chat:ai-on' : 'chat:ai-off', { wa_jid: waJid, phone: row.phone }, actor)
  }

  /** After `.pause`, let every chat send its one-time holding message again. */
  async function clearHandoffNotices() {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ handoff_at: null })
      .not('handoff_at', 'is', null)
    if (error) log.error?.('[control] clear handoff notices failed:', error.message)
  }

  /** `.start` returns every conversation to the AI. */
  async function resumeAllChats(actor = 'admin') {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ ai_enabled: true, handoff_at: null })
      .not('wa_jid', 'is', null)
    if (error) throw new Error(error.message)
    await audit('chats:resume-all', {}, actor)
  }

  async function setMarketing(patch, actor = 'admin') {
    const allowed = {}
    if (typeof patch.marketing_enabled === 'boolean') allowed.marketing_enabled = patch.marketing_enabled
    if (typeof patch.require_approval === 'boolean') allowed.require_approval = patch.require_approval
    for (const key of ['status_interval_minutes', 'group_interval_minutes', 'status_daily_limit', 'group_daily_limit']) {
      if (patch[key] != null && Number.isFinite(Number(patch[key]))) {
        allowed[key] = Math.trunc(Number(patch[key]))
      }
    }
    const row = await write(allowed, actor)
    await audit('marketing:settings', allowed, actor)
    return row
  }

  async function touchStatus(actor = 'marketing') {
    return write({ last_status_at: new Date().toISOString() }, actor)
  }

  async function touchGroup(actor = 'marketing') {
    return write({ last_group_at: new Date().toISOString() }, actor)
  }

  /**
   * Decide whether the AI may answer. `blocked` is silent by design; the other
   * stop reasons get one holding message and one admin alert per chat.
   */
  async function gate({ phone, aiEnabled }) {
    const snap = await read()
    const clean = digits(phone)

    if (clean && snap.blocklist.includes(clean)) {
      return { ai: false, reason: 'blocked', snapshot: snap }
    }
    if (snap.mode === 'off') {
      return { ai: false, reason: 'off', snapshot: snap }
    }
    if (!aiEnabled) {
      return { ai: false, reason: 'handoff', snapshot: snap }
    }
    if (snap.allowlist.length > 0 && !snap.allowlist.includes(clean)) {
      return { ai: false, reason: 'allowlist', snapshot: snap }
    }
    return { ai: true, reason: 'active', snapshot: snap }
  }

  return {
    read,
    write,
    audit,
    setMode,
    setList,
    addToList,
    removeFromList,
    setChatAI,
    clearHandoffNotices,
    resumeAllChats,
    setMarketing,
    touchStatus,
    touchGroup,
    gate,
  }
}
