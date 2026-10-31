import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

/**
 * Anyone signed in can claim a house request when they have a matching house.
 * Claiming only reserves the chance to upload: it never reveals requester
 * contact details. After upload the requester is sent to the lister's public
 * listings page to pick a house; contact exchange happens only after payment.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to claim this request.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .maybeSingle()

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

  const listerName = profile?.full_name || profile?.username || user.email || 'A lister'

  await notifyAdmins(
    'House Request Claimed',
    'Lister Found a Matching House',
    {
      'Request Location': existing.location || 'N/A',
      'Claimed By': listerName,
      'Lister ID': user.id,
      'Next Step': 'The claimer must upload a matching house. The requester will then be sent the lister\'s listings page to pick one.',
      'Action Required': 'Follow up to confirm the upload and keep the request status up to date.',
    }
  )

  return NextResponse.json(data)
}
