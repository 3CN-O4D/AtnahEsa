import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OWNER_SHARE } from '@/lib/constants'
import { resolveListerIdentity } from '@/lib/lister-identity'

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

  // `status: 'confirmed'` alone is not enough: an admin status edit can set it
  // without money in escrow. Only a real held/paid escrow unlocks the phone.
  const paid = ['held', 'paid', 'released'].includes(booking.release_status || '')
  if (!paid) {
    return NextResponse.json({ error: 'Contact unlocks after payment is confirmed' }, { status: 402 })
  }

  const { data: listing } = await admin
    .from('listings')
    .select('id, title, location, description, lister_phone, uploader_id, uploader_name')
    .eq('id', booking.listing_id)
    .maybeSingle()

  const lister = await resolveListerIdentity(admin, listing)
  const { name, phone } = lister

  return NextResponse.json({
    name,
    phone,
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
