import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The bot's own activity diary.
 *
 * GET    — recent outbound actions (statuses, group posts, calls, voice notes,
 *          control changes) so an admin can see what Ase has done.
 * DELETE — remove noisy rows from the panel. The worker keeps writing new
 *          ones; deleting history here does not make the bot repost.
 */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 300)

  let query = db
    .from('whatsapp_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) {
    console.error('[admin/whatsapp] activity query failed:', error.message)
    return NextResponse.json({ error: 'Could not load activity.' }, { status: 500 })
  }

  const { data: kinds } = await db
    .from('whatsapp_activity')
    .select('kind')
    .order('created_at', { ascending: false })
    .limit(500)

  return NextResponse.json(
    {
      items: data ?? [],
      kinds: [...new Set((kinds ?? []).map((row) => row.kind))].sort(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function DELETE(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: { id?: unknown; ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
    : typeof body.id === 'string' || typeof body.id === 'number'
      ? [body.id]
      : []

  if (!ids.length) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await db.from('whatsapp_activity').delete().in('id', ids)
  if (error) {
    console.error('[admin/whatsapp] activity delete failed:', error.message)
    return NextResponse.json({ error: 'Could not delete that activity.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'activity:delete',
    detail: { ids, count: ids.length },
  })

  return NextResponse.json({ deleted: ids.length }, { headers: { 'Cache-Control': 'no-store' } })
}
