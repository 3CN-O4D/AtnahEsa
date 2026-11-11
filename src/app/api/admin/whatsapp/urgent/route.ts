import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Urgent / escalated WhatsApp items for the admin panel. */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  let query = db
    .from('whatsapp_urgent')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && ['open', 'acknowledged', 'resolved'].includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin/whatsapp] urgent query failed:', error.message)
    return NextResponse.json({ error: 'Could not load escalations.' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: { id?: unknown; status?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  const status = body.status
  if (!id || !['open', 'acknowledged', 'resolved'].includes(String(status))) {
    return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status }
  if (status === 'acknowledged') {
    patch.acknowledged_by = email
    patch.acknowledged_at = now
  }
  if (status === 'resolved') {
    patch.resolved_at = now
    if (!patch.acknowledged_at) patch.acknowledged_at = now
    if (!patch.acknowledged_by) patch.acknowledged_by = email
  }

  const { data, error } = await db
    .from('whatsapp_urgent')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/whatsapp] urgent update failed:', error.message)
    return NextResponse.json({ error: 'Could not update that item.' }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}
