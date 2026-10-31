import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  effectiveReadAt,
  getNotificationAudiences,
  isNotificationDismissed,
  isNotificationExpired,
  isNotificationVisibleTo,
  normalizeAudiences,
  type NotificationRow,
} from '@/lib/notification-audience'

const ALLOWED_CATEGORIES = ['advert', 'new_house', 'transaction', 'linking', 'booking', 'listing', 'system']

async function currentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  return { user, role: (profile?.role || '') as string }
}

function appendUnique(list: unknown, value: string): string[] {
  const current = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []
  return current.includes(value) ? current : [...current, value]
}

export async function GET() {
  const auth = await currentUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = Date.now()
  const notifications = ((data || []) as NotificationRow[])
    .filter(
      (row) =>
        isNotificationVisibleTo(row, auth.user.id, auth.role) &&
        !isNotificationExpired(row, now) &&
        !isNotificationDismissed(row, auth.user.id)
    )
    .map((row) => ({
      ...row,
      audiences: getNotificationAudiences(row),
      expires_at: (row.data?.expires_at as string | undefined) || null,
      read_at: effectiveReadAt(row, auth.user.id),
    }))

  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.read_at).length,
    role: auth.role,
  })
}

export async function POST(request: Request) {
  const auth = await currentUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const {
    title,
    body: notifBody = '',
    link = '',
    category = 'system',
    user_id,
    audience,
    audiences: audiencesInput,
    duration_hours,
    expires_at,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'system'
  const audiences = normalizeAudiences(audiencesInput ?? audience)
  const hours = Number(duration_hours)
  const expiresAt =
    typeof expires_at === 'string' && expires_at
      ? new Date(expires_at).toISOString()
      : Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
        : null

  const admin = createAdminClient()
  const { error } = await admin.from('notifications').insert({
    user_id: user_id || null,
    // Broadcasts stay visible at the RLS level; the API filters by audience.
    role: '',
    category: safeCategory,
    title: String(title).trim(),
    body: notifBody,
    link,
    data: {
      sent_by: auth.user.id,
      audiences,
      expires_at: expiresAt,
      dismissed_by: [],
      read_by: [],
    },
    is_broadcast: !user_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, audiences, expires_at: expiresAt })
}

export async function PATCH(request: Request) {
  const auth = await currentUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { all, ids } = body
  const admin = createAdminClient()

  const { data, error } = await admin.from('notifications').select('*').limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requestedIds = Array.isArray(ids)
    ? ids.filter((id: unknown): id is string | number => typeof id === 'string' || typeof id === 'number')
    : []
  const requestedIdSet = new Set(requestedIds.map(String))
  const targets = ((data || []) as NotificationRow[]).filter((row) => {
    if (!isNotificationVisibleTo(row, auth.user.id, auth.role)) return false
    if (isNotificationExpired(row) || isNotificationDismissed(row, auth.user.id)) return false
    return all ? !effectiveReadAt(row, auth.user.id) : requestedIdSet.has(String(row.id))
  })

  const now = new Date().toISOString()
  await Promise.all(
    targets.map((row) => {
      if (row.user_id === auth.user.id) {
        return admin.from('notifications').update({ read_at: now }).eq('id', row.id)
      }
      const readBy = appendUnique(row.data?.read_by, auth.user.id)
      return admin
        .from('notifications')
        .update({ data: { ...(row.data || {}), read_by: readBy, read_at_by_user: now } })
        .eq('id', row.id)
    })
  )

  return NextResponse.json({ success: true, count: targets.length })
}

export async function DELETE(request: Request) {
  const auth = await currentUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { ids, global: deleteForEveryone } = body
  const requestedIds = Array.isArray(ids)
    ? ids.filter((id: unknown): id is string | number => typeof id === 'string' || typeof id === 'number')
    : []
  if (requestedIds.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Admins may permanently remove a broadcast for every user.
  if (deleteForEveryone) {
    if (auth.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { error } = await admin.from('notifications').delete().in('id', requestedIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, deleted: requestedIds.length, global: true })
  }

  const { data, error } = await admin
    .from('notifications')
    .select('*')
    .in('id', requestedIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let removed = 0
  await Promise.all(
    ((data || []) as NotificationRow[]).map(async (row) => {
      // Personal notifications belong to one user: delete the row outright.
      if (row.user_id && row.user_id === auth.user.id) {
        const { error: delError } = await admin.from('notifications').delete().eq('id', row.id)
        if (!delError) removed += 1
        return
      }
      // Everyone can hide a broadcast for themselves without affecting others.
      if (row.user_id === null && isNotificationVisibleTo(row, auth.user.id, auth.role)) {
        const dismissedBy = appendUnique(row.data?.dismissed_by, auth.user.id)
        const { error: updError } = await admin
          .from('notifications')
          .update({ data: { ...(row.data || {}), dismissed_by: dismissedBy } })
          .eq('id', row.id)
        if (!updError) removed += 1
      }
    })
  )

  return NextResponse.json({ success: true, deleted: removed })
}
