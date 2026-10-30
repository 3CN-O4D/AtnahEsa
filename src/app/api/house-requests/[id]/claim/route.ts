import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

/**
 * Lister claims a house request when they have a matching house.
 * The claimer can then message the requester directly on WhatsApp via
 * /api/house-requests/[id]/contact. Unclaimed requests stay anonymous.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, username')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'lister' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use the service role for the claim transaction so the result does not
  // depend on lister SELECT policies, and never return requester contact data.
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('house_requests')
    .select('id, status, claimed_by, location')
    .eq('id', id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (existing.status === 'closed' || existing.status === 'fulfilled') {
    return NextResponse.json({ error: 'This request is already closed.' }, { status: 400 })
  }

  if (existing.claimed_by && existing.claimed_by !== user.id) {
    return NextResponse.json({ error: 'Another lister has already taken this request.' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('house_requests')
    .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, claimed_by, claimed_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const listerName = profile.full_name || profile.username || user.email || 'A lister'

  await notifyAdmins(
    'House Request Claimed',
    'Lister Found a Matching House',
    {
      'Request Location': existing.location || 'N/A',
      'Claimed By': listerName,
      'Lister ID': user.id,
      'Next Step': 'The lister can now message the requester on WhatsApp to arrange a viewing.',
      'Action Required': 'Follow up to confirm the match and keep the request status up to date.',
    }
  )

  return NextResponse.json(data)
}
