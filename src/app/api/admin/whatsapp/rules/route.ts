import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reply/group rules for Ase. The worker reads the same singleton JSON row and
 * applies it within ~5 seconds, so saves here need no redeploy.
 *
 * GET   — current settings merged with the worker's safe defaults.
 * PATCH — replace individual rule keys and write an audit row.
 */

const DEFAULTS = {
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
  groups_enabled: false,
  groups_require_mention: true,
  group_last_speaker_guard: true,
  group_silent: false,
  enabled_groups_only: true,
  reply_probability: 100,
  circuit_breaker: { enabled: true, max_errors: 5 },
  dry_run: false,
}

const BOOLEAN_KEYS = Object.keys(DEFAULTS).filter(
  (key) => typeof DEFAULTS[key as keyof typeof DEFAULTS] === 'boolean'
)
const NUMBER_KEYS = ['typing_delay_seconds', 'handoff_after_misses', 'reply_probability']
const LIST_KEYS = ['intent_keywords', 'keyword_allowlist', 'keyword_blocklist']
const OBJECT_KEYS = ['quiet_hours', 'per_chat_rate_limit', 'global_rate_limit', 'circuit_breaker']

function merge(settings: Record<string, unknown> | null) {
  const result: Record<string, unknown> = { ...DEFAULTS, ...(settings || {}) }
  for (const key of Object.keys(DEFAULTS)) {
    const value = DEFAULTS[key as keyof typeof DEFAULTS]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = { ...(value as object), ...((settings?.[key] as object) || {}) }
    }
  }
  return result
}

function cleanPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  for (const key of BOOLEAN_KEYS) {
    if (typeof body[key] === 'boolean') patch[key] = body[key]
  }
  for (const key of NUMBER_KEYS) {
    if (body[key] === undefined) continue
    const value = Number(body[key])
    if (Number.isFinite(value) && value >= 0) patch[key] = value
  }
  for (const key of LIST_KEYS) {
    if (Array.isArray(body[key])) {
      patch[key] = [...new Set(body[key].map((item) => String(item).trim()).filter(Boolean))].slice(0, 100)
    } else if (typeof body[key] === 'string') {
      patch[key] = body[key].split(',').map((item) => item.trim()).filter(Boolean).slice(0, 100)
    }
  }
  for (const key of OBJECT_KEYS) {
    if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
      patch[key] = { ...((DEFAULTS[key as keyof typeof DEFAULTS] as object) || {}), ...body[key] }
    }
  }
  return patch
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const [{ data, error }, { data: overrides }] = await Promise.all([
    db
      .from('whatsapp_bot_rules')
      .select('settings, updated_by, updated_at')
      .eq('id', 1)
      .maybeSingle(),
    db.from('whatsapp_rule_overrides').select('*').order('created_at', { ascending: false }),
  ])

  if (error?.message?.includes('relation "public.whatsapp_bot_rules" does not exist')) {
    return NextResponse.json(
      { migration_required: true, hint: 'Run supabase/migration-whatsapp-console.sql once.', settings: merge(null), overrides: overrides ?? [] },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
  if (error) {
    console.error('[admin/whatsapp/rules] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load rules.' }, { status: 500 })
  }
  if (!data) {
    const seeded = await db.from('whatsapp_bot_rules').upsert({ id: 1, settings: {} })
    if (seeded.error) {
      return NextResponse.json({ error: 'Could not initialise rules.' }, { status: 500 })
    }
  }

  return NextResponse.json(
    {
      settings: merge(data?.settings as Record<string, unknown> | null),
      overrides: overrides ?? [],
      updated_by: data?.updated_by ?? null,
      updated_at: data?.updated_at ?? null,
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

  const patch = cleanPatch(body)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid rule changes supplied.' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('whatsapp_bot_rules')
    .select('settings')
    .eq('id', 1)
    .maybeSingle()

  const next = merge({ ...((existing?.settings as Record<string, unknown>) || {}), ...patch })
  const { error } = await db
    .from('whatsapp_bot_rules')
    .upsert({
      id: 1,
      settings: next,
      updated_by: email,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[admin/whatsapp/rules] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save rules. Run the console migration first.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'rules:update',
    detail: { patch },
  })

  return NextResponse.json({ settings: next }, { headers: { 'Cache-Control': 'no-store' } })
}
