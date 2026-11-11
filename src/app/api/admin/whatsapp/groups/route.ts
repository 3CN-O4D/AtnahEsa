import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WhatsApp groups the number belongs to.
 *
 * The worker discovers groups on connect and inserts them disabled. Marketing
 * only goes to a group an admin explicitly enables, and each group keeps its
 * own cadence so the number is never blasted.
 */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const { data, error } = await db
    .from('whatsapp_marketing_groups')
    .select('*')
    .order('enabled', { ascending: false })
    .order('name', { ascending: true })
    .limit(200)

  if (error) {
    console.error('[admin/whatsapp] groups query failed:', error.message)
    return NextResponse.json({ error: 'Could not load groups.' }, { status: 500 })
  }

  return NextResponse.json({ groups: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: { jid?: unknown; enabled?: unknown; cadence_minutes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const jid = typeof body.jid === 'string' ? body.jid : ''
  if (!jid) return NextResponse.json({ error: 'jid is required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.cadence_minutes != null && Number.isFinite(Number(body.cadence_minutes))) {
    patch.cadence_minutes = Math.max(180, Math.trunc(Number(body.cadence_minutes)))
  }

  const { data, error } = await db
    .from('whatsapp_marketing_groups')
    .update(patch)
    .eq('jid', jid)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/whatsapp] group update failed:', error.message)
    return NextResponse.json({ error: 'Could not update that group.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'group:update',
    detail: { jid, ...patch },
  })

  return NextResponse.json({ group: data }, { headers: { 'Cache-Control': 'no-store' } })
}
