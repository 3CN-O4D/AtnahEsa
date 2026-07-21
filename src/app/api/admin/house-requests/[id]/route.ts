import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyUser } from '@/lib/notify'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.status) updates.status = body.status
  if (body.admin_notes !== undefined) updates.admin_notes = body.admin_notes

  const { data, error } = await supabase.from('house_requests').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.status === 'fulfilled' && data?.email) {
    await notifyUser(data.email, 'House Found! 🏠', 'We Found a House for You!', {
      Name: data.name || 'Valued Customer',
      Status: 'A house matching your preferences has been found!',
      'Next Steps': 'We will contact you shortly to arrange a viewing.',
      Notes: body.admin_notes || 'Our team will reach out to you soon.',
    })
  }

  if (body.status === 'contacted' && data?.email) {
    await notifyUser(data.email, 'We\'re Working on Your Request', 'Update on Your House Request', {
      Name: data.name || 'Valued Customer',
      Status: 'Your request is being processed.',
      Notes: body.admin_notes || 'We are searching for available houses for you.',
    })
  }

  return NextResponse.json(data)
}