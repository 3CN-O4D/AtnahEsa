import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Per-status / per-group / per-topic overrides for the status scheduler.
 * A row is a partial patch on top of the global `whatsapp_status_settings`.
 *
 * GET    — all overrides.
 * POST   — create `{ scope, target, settings, enabled?, note? }`.
 * PATCH  — update `{ id, settings?, enabled?, note? }`.
 * DELETE — `{ id }` or `{ ids }`.
 */

const SCOPES = ['status', 'group', 'topic'] as const
const MODES = ['off', 'auto', 'stats', 'event', 'random', 'round_robin', 'hybrid'] as const
const ALLOWED_KEYS = [
  'mode', 'interval_minutes', 'daily_limit', 'quiet_hours', 'templates',
  'topics', 'random_pool', 'no_repeat_window', 'event_hooks', 'require_approval',
]

function cleanSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const patch: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_KEYS.includes(key) || item === undefined) continue
    if (key === 'mode') {
      if (MODES.includes(item as (typeof MODES)[number])) patch.mode = item
    } else if (key === 'interval_minutes') {
      const number = Number(item)
      if (Number.isFinite(number) && number >= 5 && number <= 1440) patch.interval_minutes = number
    } else if (key === 'daily_limit') {
      const number = Number(item)
      if (Number.isFinite(number) && number >= 1 && number <= 24) patch.daily_limit = number
    } else if (key === 'no_repeat_window') {
      const number = Number(item)
      if (Number.isFinite(number) && number >= 0 && number <= 100) patch.no_repeat_window = number
    } else if (key === 'require_approval') {
      if (typeof item === 'boolean') patch.require_approval = item
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      patch[key] = item
    } else if (Array.isArray(item)) {
      patch[key] = item.slice(0, 200)
    }
  }
  return Object.keys(patch).length ? patch : null
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const { data, error } = await db
    .from('whatsapp_status_overrides')
    .select('*')
    .order('scope', { ascending: true })
    .order('target', { ascending: true })

  if (error?.message?.includes('does not exist')) {
    return NextResponse.json({
      migration_required: true,
      hint: 'Run supabase/migration-whatsapp-console.sql once.',
      items: [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (error) {
    console.error('[admin/whatsapp/status/overrides] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load overrides.' }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }

  const scope = String(body.scope || '')
  if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
    return NextResponse.json({ error: 'scope must be status, group or topic.' }, { status: 400 })
  }
  const target = String(body.target || '').trim()
  if (!target) return NextResponse.json({ error: 'target is required.' }, { status: 400 })
  const settings = cleanSettings(body.settings)
  if (!settings) return NextResponse.json({ error: 'Add at least one setting to override.' }, { status: 400 })

  const { data, error } = await db
    .from('whatsapp_status_overrides')
    .upsert({
      scope,
      target,
      settings,
      enabled: body.enabled !== false,
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scope,target' })
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/whatsapp/status/overrides] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save override. Run the console migration first.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'status:override',
    detail: { scope, target, settings },
  })
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_by: email, updated_at: new Date().toISOString() }
  const settings = cleanSettings(body.settings)
  if (settings) patch.settings = settings
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 300)
  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await db
    .from('whatsapp_status_overrides')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('[admin/whatsapp/status/overrides] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update override.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({ actor: email, action: 'status:override-update', detail: { id, patch } })
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: { id?: unknown; ids?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : typeof body.id === 'string' ? [body.id] : []
  if (!ids.length) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { error } = await db.from('whatsapp_status_overrides').delete().in('id', ids)
  if (error) {
    console.error('[admin/whatsapp/status/overrides] delete failed:', error.message)
    return NextResponse.json({ error: 'Could not delete override.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({ actor: email, action: 'status:override-delete', detail: { ids } })
  return NextResponse.json({ deleted: ids.length }, { headers: { 'Cache-Control': 'no-store' } })
}
