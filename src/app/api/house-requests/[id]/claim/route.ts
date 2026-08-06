import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

/**
 * Lister claims a house request when they have a matching house.
 * The requester is never revealed to the lister — only the admin sees
 * contact details and notifies the requester on behalf of the lister.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, full_name, username').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'lister' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing } = await supabase
    .from('house_requests')
    .select('id, status, claimed_by, location')
    .eq('id', id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (existing.status === 'closed' || existing.status === 'fulfilled') {
    return NextResponse.json({ error: 'This request is already closed.' }, { status: 400 })
  }

  if (existing.claimed_by && existing.claimed_by !== user.id) {
    return NextResponse.json({ error: 'Another lister has already taken this request.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('house_requests')
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const listerName = profile.full_name || profile.username || user.email || 'A lister'

  await notifyAdmins(
    'House Request Claimed',
    'Lister Found a Matching House',
    {
      'Request Location': existing.location || 'N/A',
      'Claimed By': listerName,
      'Lister ID': user.id,
      'Next Step': 'Contact the requester and share this house to arrange a viewing.',
      'Action Required': 'Reach out to the requester on behalf of the lister to confirm the match.',
    }
  )

  return NextResponse.json(data)
}