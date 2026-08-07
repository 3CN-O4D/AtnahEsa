import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role || ''

  const query = supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: notifications } = await query
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .is('read_at', null)

  const visible = (notifications || []).filter(
    (n) => n.user_id === user.id || n.role === '' || n.role === role
  )

  return NextResponse.json({
    notifications: visible,
    unreadCount: unreadCount || 0,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { title, body: notifBody = '', link = '', category = 'system', audience = 'everyone', user_id, role = '' } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const allowedCategories = ['advert', 'new_house', 'transaction', 'linking', 'booking', 'listing', 'system']
  const safeCategory = allowedCategories.includes(category) ? category : 'system'

  const { error } = await supabase.from('notifications').insert({
    user_id: user_id || null,
    role: audience === 'role' ? role : audience === 'everyone' ? '' : '',
    category: safeCategory,
    title: String(title).trim(),
    body: notifBody,
    link,
    data: { sent_by: user.id },
    is_broadcast: !user_id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { all, ids } = body

  const own = supabase.from('notifications').update({ read_at: new Date().toISOString() })
  if (all) {
    own.is('read_at', null).eq('user_id', user.id)
  } else {
    own.in('id', Array.isArray(ids) && ids.length ? ids : [])
  }

  const { error } = await own
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
