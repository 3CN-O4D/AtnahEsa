import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Status mode config + history for Ase.
 *
 * GET   — settings and the last 100 posted statuses.
 * PATCH — mode, cadence, templates, random pool, topics, event hooks.
 * The worker polls this row, so changes apply within ~5 seconds.
 */

const MODES = ['off', 'auto', 'stats', 'event', 'random', 'round_robin', 'hybrid'] as const

const DEFAULTS = {
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

type Settings = typeof DEFAULTS & Record<string, unknown>

function normalise(row: Record<string, unknown> | null): Settings {
  return {
    ...DEFAULTS,
    ...(row || {}),
    quiet_hours: { ...DEFAULTS.quiet_hours, ...((row?.quiet_hours as object) || {}) },
    event_hooks: { ...DEFAULTS.event_hooks, ...((row?.event_hooks as object) || {}) },
    templates: (row?.templates && typeof row.templates === 'object' ? row.templates : {}),
    topics: Array.isArray(row?.topics) ? row.topics : [],
    random_pool: Array.isArray(row?.random_pool) ? row.random_pool : [],
  } as Settings
}

const HOOK_KEYS = Object.keys(DEFAULTS.event_hooks)

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const [{ data: row, error }, { data: queueRaw }, { data: history }, { data: overrides }] = await Promise.all([
    db.from('whatsapp_status_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('whatsapp_marketing')
      .select('*')
      .eq('channel', 'status')
      .order('created_at', { ascending: false })
      .limit(200),
    db.from('whatsapp_status_history')
      .select('id, mode, topic, body, kind, created_at, meta')
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('whatsapp_status_overrides').select('*').order('created_at', { ascending: false }),
  ])

  if (error?.message?.includes('relation "public.whatsapp_status_settings" does not exist')) {
    return NextResponse.json({
      migration_required: true,
      hint: 'Run supabase/migration-whatsapp-console.sql once.',
      settings: normalise(null),
      queue: [],
      history: [],
      overrides: [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (error) {
    console.error('[admin/whatsapp/status] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load status settings.' }, { status: 500 })
  }

  /*
   * WhatsApp statuses live for 24 hours. Hide anything whose TTL has passed so
   * the panel only shows what can still be seen, scheduled or acted on.
   */
  const now = Date.now()
  const queue = (queueRaw ?? [])
    .map((item) => {
      const sentAt = item.sent_at ? Date.parse(String(item.sent_at)) : null
      const explicitExpiry = item.expires_at ? Date.parse(String(item.expires_at)) : null
      const expiresAt = explicitExpiry || (sentAt && !Number.isNaN(sentAt) ? sentAt + 24 * 60 * 60 * 1000 : null)
      const expired = Boolean(expiresAt && expiresAt <= now)
      const state = item.status === 'sent' ? 'posted'
        : item.status === 'approved' || item.status === 'scheduled'
          ? (item.scheduled_for && Date.parse(String(item.scheduled_for)) > now ? 'upcoming' : 'due')
          : item.status
      return { ...item, expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, expired, state }
    })
    .filter((item) => !item.expired)

  return NextResponse.json(
    {
      settings: normalise(row as Record<string, unknown> | null),
      queue,
      history: history ?? [],
      overrides: overrides ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.mode === 'string' && MODES.includes(body.mode as (typeof MODES)[number])) {
    patch.mode = body.mode
  }
  if (body.interval_minutes !== undefined) {
    const value = Number(body.interval_minutes)
    if (Number.isFinite(value) && value >= 5 && value <= 1440) patch.interval_minutes = value
  }
  if (body.daily_limit !== undefined) {
    const value = Number(body.daily_limit)
    if (Number.isFinite(value) && value >= 1 && value <= 24) patch.daily_limit = value
  }
  if (body.no_repeat_window !== undefined) {
    const value = Number(body.no_repeat_window)
    if (Number.isFinite(value) && value >= 0 && value <= 100) patch.no_repeat_window = value
  }
  if (typeof body.require_approval === 'boolean') patch.require_approval = body.require_approval
  if (body.quiet_hours && typeof body.quiet_hours === 'object') {
    patch.quiet_hours = { ...DEFAULTS.quiet_hours, ...body.quiet_hours }
  }
  if (body.event_hooks && typeof body.event_hooks === 'object') {
    const hooks: Record<string, boolean> = {}
    for (const key of HOOK_KEYS) {
      if (typeof (body.event_hooks as Record<string, unknown>)[key] === 'boolean') {
        hooks[key] = (body.event_hooks as Record<string, boolean>)[key]
      }
    }
    patch.event_hooks = { ...DEFAULTS.event_hooks, ...hooks }
  }
  if (body.templates && typeof body.templates === 'object' && !Array.isArray(body.templates)) {
    const templates: Record<string, string> = {}
    for (const [key, value] of Object.entries(body.templates)) {
      if (typeof value === 'string') templates[key] = value.slice(0, 2000)
    }
    patch.templates = templates
  }
  if (Array.isArray(body.topics)) {
    patch.topics = body.topics
      .map((item) => (typeof item === 'string' ? { name: item } : item))
      .filter((item) => item && typeof item === 'object')
      .slice(0, 100)
  }
  if (Array.isArray(body.random_pool)) {
    patch.random_pool = body.random_pool
      .map((item) => (typeof item === 'string' ? { body: item } : item))
      .filter((item) => item && typeof item === 'object' && typeof (item as { body?: unknown }).body === 'string')
      .slice(0, 200)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid status changes supplied.' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('whatsapp_status_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  const next = normalise({ ...((existing as Record<string, unknown>) || {}), ...patch })
  const row = {
    id: 1,
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
    last_event_at: next.last_event_at,
    updated_by: email,
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('whatsapp_status_settings').upsert(row)

  if (error) {
    console.error('[admin/whatsapp/status] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save status settings. Run the console migration first.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'status:update',
    detail: { patch },
  })

  return NextResponse.json({ settings: next }, { headers: { 'Cache-Control': 'no-store' } })
}
