import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { VALIDATION_SCHEMAS, addSecurityHeaders, withRateLimit } from '@/lib/security'

/** Public: file a complaint, bug report or feature request. */
export async function POST(request: NextRequest) {
  const { allowed, headers } = await withRateLimit(request, 'contact')
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a few minutes and try again.' },
      { status: 429, headers }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers })
  }

  const parsed = VALIDATION_SCHEMAS.complaintSubmit.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Please check the form and try again.' },
      { status: 400, headers }
    )
  }

  const data = parsed.data
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('complaints')
    .insert({
      user_id: user?.id ?? null,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: (data.phone || '').trim(),
      category: data.category,
      subject: data.subject.trim(),
      message: data.message.trim(),
      related_listing_id: data.related_listing_id || null,
    })
    .select('id, subject, category')
    .single()

  if (error) {
    console.error('complaint insert failed:', error)
    return NextResponse.json({ error: 'Could not save your report. Please try again.' }, { status: 500, headers })
  }

  await createNotification({
    role: 'admin',
    category: 'system',
    title: `New ${data.category === 'bug' ? 'bug report' : 'complaint'}: ${data.subject.trim()}`,
    body: `${data.name.trim()} · ${data.email.trim()}`,
    link: '/admin/complaints',
    data: { complaint_id: row.id, category: row.category },
  })

  const response = NextResponse.json({ success: true, id: row.id }, { status: 201, headers })
  return addSecurityHeaders(response)
}

/** Admins: list every complaint, newest first. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const status = new URL(request.url).searchParams.get('status')
  const admin = createAdminClient()
  let query = admin.from('complaints').select('*').order('created_at', { ascending: false }).limit(200)
  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
