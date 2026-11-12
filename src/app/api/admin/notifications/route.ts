import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'
import {
  getNotificationAudiences,
  normalizeAudiences,
  type NotificationAudience,
  type NotificationRow,
} from '@/lib/notification-audience'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin view of in-app notifications.
 *
 * GET    — list notifications with their real audience.
 * PATCH  — retarget a broadcast between everyone and a subgroup (hunter,
 *          lister, admin), or edit its wording.
 * DELETE — remove one or many notifications.
 *
 * Personal notifications (user_id set) can be edited/deleted but never
 * retargeted: they belong to exactly one person.
 */

function audienceLabel(row: NotificationRow): string {
  if (row.user_id) return 'personal'
  const audiences = getNotificationAudiences(row)
  return audiences.length === 1 ? audiences[0] : audiences.join(', ')
}

export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const audience = url.searchParams.get('audience')
  const category = url.searchParams.get('category')

  let query = db.from('notifications').select('*').order('created_at', { ascending: false }).limit(300)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) {
    console.error('[admin/notifications] query failed:', error.message)
    return NextResponse.json({ error: 'Could not load notifications.' }, { status: 500 })
  }

  const rows = (data ?? []) as NotificationRow[]
  const enriched = rows.map((row) => ({
    ...row,
    audiences: row.user_id ? [] : getNotificationAudiences(row),
    audience_label: audienceLabel(row),
  }))

  const filtered = audience
    ? enriched.filter((row) =>
        audience === 'personal' ? Boolean(row.user_id) : row.audiences.includes(audience as NotificationAudience)
      )
    : enriched

  const counts = {
    total: enriched.length,
    everyone: enriched.filter((row) => !row.user_id && row.audiences.includes('everyone')).length,
    hunter: enriched.filter((row) => !row.user_id && row.audiences.includes('hunter')).length,
    lister: enriched.filter((row) => !row.user_id && row.audiences.includes('lister')).length,
    admin: enriched.filter((row) => !row.user_id && row.audiences.includes('admin')).length,
    personal: enriched.filter((row) => Boolean(row.user_id)).length,
  }

  return NextResponse.json(
    { items: filtered, counts },
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
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: existing, error: readError } = await db
    .from('notifications')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    console.error('[admin/notifications] read failed:', readError.message)
    return NextResponse.json({ error: 'Could not load that notification.' }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ error: 'Notification not found.' }, { status: 404 })

  const row = existing as NotificationRow
  const patch: Record<string, unknown> = {}

  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200)
  if (typeof body.body === 'string') patch.body = body.body.slice(0, 4000)
  if (typeof body.link === 'string') patch.link = body.link.trim().slice(0, 500)

  if (body.audiences !== undefined) {
    if (row.user_id) {
      return NextResponse.json(
        { error: 'Personal notifications cannot be retargeted. Delete it and create a broadcast instead.' },
        { status: 400 }
      )
    }

    const audiences = normalizeAudiences(body.audiences)
    const data =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? { ...(row.data as Record<string, unknown>) }
        : {}
    data.audiences = audiences

    patch.data = data
    // One audience can be enforced by RLS; a mixed audience stays role-less and
    // is filtered by `data.audiences` in the API.
    patch.role = audiences.length === 1 && audiences[0] !== 'everyone' ? audiences[0] : ''
    patch.is_broadcast = true
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { data, error } = await db
    .from('notifications')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/notifications] update failed:', error.message)
    return NextResponse.json({ error: 'Could not update that notification.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'notification:update',
    detail: { id, audiences: body.audiences ?? null, fields: Object.keys(patch) },
  })

  return NextResponse.json(
    {
      item: data
        ? { ...data, audiences: data.user_id ? [] : getNotificationAudiences(data), audience_label: audienceLabel(data) }
        : null,
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
    ? body.ids.filter((id): id is string => typeof id === 'string')
    : typeof body.id === 'string'
      ? [body.id]
      : []

  if (!ids.length) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await db.from('notifications').delete().in('id', ids)
  if (error) {
    console.error('[admin/notifications] delete failed:', error.message)
    return NextResponse.json({ error: 'Could not delete those notifications.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'notification:delete',
    detail: { ids, count: ids.length },
  })

  return NextResponse.json({ deleted: ids.length }, { headers: { 'Cache-Control': 'no-store' } })
}
