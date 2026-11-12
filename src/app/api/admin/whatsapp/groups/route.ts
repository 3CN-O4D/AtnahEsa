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

/**
 * Ask the worker to re-read the WhatsApp group list.
 *
 * The worker owns the Baileys socket, so the app cannot enumerate groups on
 * its own. This proxies a POST to the worker and returns the refreshed rows.
 */
export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  const worker = (
    process.env.WHATSAPP_WORKER_URL || 'https://atnahesa.onrender.com'
  ).replace(/\/$/, '')
  const secret = process.env.WHATSAPP_BRIDGE_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'WHATSAPP_BRIDGE_SECRET is not configured.' }, { status: 500 })
  }

  try {
    const res = await fetch(`${worker}/groups/sync`, {
      method: 'POST',
      headers: { 'x-bridge-secret': secret },
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
    })
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; groups?: number; error?: string }
      | null

    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error || 'The WhatsApp worker could not sync groups.' },
        { status: res.status === 401 ? 502 : res.status }
      )
    }

    const { data: groups } = await db
      .from('whatsapp_marketing_groups')
      .select('*')
      .order('enabled', { ascending: false })
      .order('name', { ascending: true })
      .limit(200)

    await db.from('whatsapp_control_audit').insert({
      actor: email,
      action: 'group:sync',
      detail: { groups: payload?.groups ?? groups?.length ?? 0 },
    })

    return NextResponse.json(
      { synced: payload?.groups ?? 0, groups: groups ?? [] },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error(
      '[admin/whatsapp] group sync failed:',
      error instanceof Error ? error.message : error
    )
    return NextResponse.json(
      { error: 'Could not reach the WhatsApp worker. Try again in a moment.' },
      { status: 502 }
    )
  }
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
