import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Requester contact details are for the AseHanta admin team only.
 *
 * Claiming a request is not a contact exchange. Hunters/lis​ters upload a
 * matching house and the requester chooses from their listings; personal
 * contact details unlock only after a paid booking.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in to view this contact.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Requester contact details are handled by the AseHanta team.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const columns = 'id, name, email, phone, location, claimed_by, status'
  let { data, error } = await admin
    .from('house_requests')
    .select(`${columns}, whatsapp`)
    .eq('id', id)
    .maybeSingle()

  // Tolerate databases that have not run the whatsapp migration yet.
  if (error && /whatsapp/i.test(`${error.code || ''} ${error.message || ''}`)) {
    const retry = await admin.from('house_requests').select(columns).eq('id', id).maybeSingle()
    data = retry.data ? { ...retry.data, whatsapp: null } : null
    error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

  const isAdmin = profile.role === 'admin'
  const isClaimer = data.claimed_by === user.id
  if (!isAdmin && !isClaimer) {
    return NextResponse.json(
      { error: 'Claim this request first to message the requester.' },
      { status: 403 }
    )
  }

  return NextResponse.json({
    id: data.id,
    name: data.name,
    location: data.location,
    whatsapp: data.whatsapp || data.phone,
    phone: isAdmin ? data.phone : undefined,
    email: isAdmin ? data.email : undefined,
  })
}
