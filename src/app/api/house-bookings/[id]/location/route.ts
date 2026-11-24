import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders, withRateLimit } from '@/lib/security'
import { exactListingLocation } from '@/lib/listing-location'

/**
 * Exact map pin for a house booking. Mirrors the booking contact gate: only the
 * hunter who paid (or an admin) can read it, and only after escrow is confirmed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const cookie = await createClient()
  const {
    data: { user },
  } = await cookie.auth.getUser()
  if (!user) {
    return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  const admin = createAdminClient()
  const { data: booking } = await admin.from('house_bookings').select('*').eq('id', id).maybeSingle()
  if (!booking) {
    return addSecurityHeaders(NextResponse.json({ error: 'Booking not found' }, { status: 404 }))
  }

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin && booking.user_id !== user.id) {
    return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
  }

  if (!['held', 'paid', 'released'].includes(booking.release_status || '')) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'The map pin unlocks after payment is confirmed' }, { status: 402 })
    )
  }

  const { data: listing } = await admin
    .from('listings')
    .select('title, location')
    .eq('id', booking.listing_id)
    .maybeSingle()

  const payload = await exactListingLocation(
    admin,
    booking.listing_id,
    listing?.location || listing?.title || booking.listing_location || 'House location'
  )
  const response = addSecurityHeaders(NextResponse.json(payload))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
