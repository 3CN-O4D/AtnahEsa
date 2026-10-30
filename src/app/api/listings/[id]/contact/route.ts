import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Lister contact for a listing.
 *
 * Public listings never expose the lister's phone. This endpoint returns it
 * only to a signed-in hunter who already has a paid (escrowed) booking on the
 * listing, or to an admin. Everyone else gets 402 with a friendly message.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view the contact' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    const [{ count: paidHouse }, { count: releasedBooking }] = await Promise.all([
      admin
        .from('house_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', id)
        .eq('user_id', user.id)
        .in('release_status', ['held', 'paid', 'released', 'refund_requested']),
      admin
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', id)
        .eq('user_id', user.id)
        .eq('release_status', 'released'),
    ])

    if ((paidHouse ?? 0) === 0 && (releasedBooking ?? 0) === 0) {
      return NextResponse.json(
        { error: 'Contact unlocks after you pay for this house', locked: true },
        { status: 402 }
      )
    }
  }

  const { data: listing } = await admin
    .from('listings')
    .select('id, title, location, lister_phone, uploader_id, uploader_name')
    .eq('id', id)
    .maybeSingle()

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

  let name = listing.uploader_name || ''
  let phone = listing.lister_phone || ''
  if (listing.uploader_id) {
    const { data: lister } = await admin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', listing.uploader_id)
      .maybeSingle()
    if (lister?.full_name) name = lister.full_name
    if (!phone && lister?.phone) phone = lister.phone
  }

  return NextResponse.json({
    name: name || 'AseHanta lister',
    phone: phone || null,
    whatsapp: phone ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}` : null,
  })
}
