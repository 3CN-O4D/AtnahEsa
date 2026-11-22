import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Per-chat / per-group rule overrides.
 *
 * A row is a partial patch on top of the global `whatsapp_bot_rules` settings.
 * The worker applies group overrides first, then chat overrides, so a single
 * person can be treated differently from the group they sit in.
 *
 * GET    — all overrides.
 * POST   — create `{ scope, target, settings, enabled?, note? }`.
 * PATCH  — update `{ id, settings?, enabled?, note? }`.
 * DELETE — `{ id }` or `{ ids }`.
 */

const SCOPES = ['chat', 'group'] as const
const ALLOWED_KEYS = [
  'last_speaker_guard', 'greet_once', 'require_intent', 'intent_keywords',
  'quiet_hours', 'typing_delay_seconds', 'per_chat_rate_limit', 'global_rate_limit',
  'ignore_forwarded', 'ignore_status_replies', 'keyword_allowlist', 'keyword_blocklist',
  'handoff_after_misses', 'groups_enabled', 'groups_require_mention',
  'group_last_speaker_guard', 'group_silent', 'enabled_groups_only',
  'reply_probability', 'circuit_breaker', 'dry_run',
]

function cleanSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const patch: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (!ALLOWED_KEYS.includes(key) || item === undefined) continue
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      patch[key] = item
    } else if (Array.isArray(item)) {
      patch[key] = item.map((row) => String(row).trim()).filter(Boolean).slice(0, 100)
    } else {
      patch[key] = item
    }
  }
  return Object.keys(patch).length ? patch : null
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const { data, error } = await db
    .from('whatsapp_rule_overrides')
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
    console.error('[admin/whatsapp/rules/overrides] read failed:', error.message)
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
    return NextResponse.json({ error: 'scope must be chat or group.' }, { status: 400 })
  }
  const target = String(body.target || '').trim()
  if (!target) return NextResponse.json({ error: 'target is required.' }, { status: 400 })
  const settings = cleanSettings(body.settings)
  if (!settings) return NextResponse.json({ error: 'Add at least one rule to override.' }, { status: 400 })

  const { data, error } = await db
    .from('whatsapp_rule_overrides')
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
    console.error('[admin/whatsapp/rules/overrides] save failed:', error.message)
    return NextResponse.json({ error: 'Could not save override. Run the console migration first.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'rules:override',
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
    .from('whatsapp_rule_overrides')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('[admin/whatsapp/rules/overrides] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update override.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({ actor: email, action: 'rules:override-update', detail: { id, patch } })
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

  const { error } = await db.from('whatsapp_rule_overrides').delete().in('id', ids)
  if (error) {
    console.error('[admin/whatsapp/rules/overrides] delete failed:', error.message)
    return NextResponse.json({ error: 'Could not delete override.' }, { status: 500 })
  }
  await db.from('whatsapp_control_audit').insert({ actor: email, action: 'rules:override-delete', detail: { ids } })
  return NextResponse.json({ deleted: ids.length }, { headers: { 'Cache-Control': 'no-store' } })
}
