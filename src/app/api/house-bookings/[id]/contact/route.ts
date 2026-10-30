import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OWNER_SHARE } from '@/lib/constants'

/**
 * Lister contact for a house booking.
 *
 * Deliberately gated: only the hunter who paid (or an admin) can read the
 * lister's phone number, and only once the payment is confirmed and in escrow.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: booking } = await admin.from('house_bookings').select('*').eq('id', id).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin && booking.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const paid =
    booking.status === 'confirmed' ||
    ['held', 'paid', 'released', 'refund_requested'].includes(booking.release_status || '')
  if (!paid) {
    return NextResponse.json({ error: 'Contact unlocks after payment is confirmed' }, { status: 402 })
  }

  const { data: listing } = await admin
    .from('listings')
    .select('id, title, location, description, lister_phone, uploader_id, uploader_name')
    .eq('id', booking.listing_id)
    .maybeSingle()

  let name = listing?.uploader_name || ''
  let phone = listing?.lister_phone || ''
  if (listing?.uploader_id) {
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
    listing: {
      id: listing?.id || booking.listing_id,
      title: listing?.title || booking.listing_title || 'House listing',
      location: listing?.location || booking.listing_location || '',
      description: listing?.description || '',
    },
    escrow: {
      release_status: booking.release_status || 'pending',
      held_until: booking.held_until,
      owner_share: OWNER_SHARE,
    },
  })
}
