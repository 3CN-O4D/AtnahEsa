import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verifies a Tuma house booking payment status by polling the linked
 * transaction. Used by the booking page to ASSERT the payment actually
 * completed (success callback) before showing the green confirmation,
 * instead of trusting that the STK push was merely initiated.
 *
 * When confirmed, returns lister linking details and the 24h escrow info
 * so the success panel can explain what happens next.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const bookingId = searchParams.get('booking_id')
    const phone = searchParams.get('phone') || ''

    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: booking } = await supabase
      .from('house_bookings')
      .select('id, status, release_status, held_until, listing_id, listing_title, listing_price, phone, payment_method')
      .eq('id', bookingId)
      .maybeSingle()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const bookingPhoneDigits = (booking.phone || '').replace(/[^0-9]/g, '').slice(-9)
    const queryPhoneDigits = phone.replace(/[^0-9]/g, '').slice(-9)
    if (phone && bookingPhoneDigits && queryPhoneDigits && bookingPhoneDigits !== queryPhoneDigits) {
      return NextResponse.json({ status: 'pending' })
    }

    const { data: tx } = await supabase
      .from('transactions')
      .select('status, result_code, result_desc, mpesa_receipt, amount, raw_callback')
      .eq('listing_id', booking.listing_id)
      .eq('phone', booking.phone || '')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const txStatus = tx?.status || 'pending'
    const paid = tx?.status === 'success' || booking.status === 'confirmed' || booking.release_status === 'held'

    let lister = null
    let listingStatus = ''
    if (paid) {
      const { data: listing } = await supabase
        .from('listings')
        .select('status, uploader_id')
        .eq('id', booking.listing_id)
        .maybeSingle()
      listingStatus = listing?.status || ''

      if (listing?.uploader_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username, phone')
          .eq('id', listing.uploader_id)
          .maybeSingle()
        if (profile) {
          lister = {
            name: profile.full_name || profile.username || 'Lister',
            phone: profile.phone || '',
          }
        }
      }
    }

    return NextResponse.json({
      status: paid ? 'success' : txStatus === 'failed' ? 'failed' : 'pending',
      payment_method: booking.payment_method || 'tuma',
      confirmed: paid,
      held_until: booking.held_until || null,
      release_status: booking.release_status || 'pending',
      receipt: tx?.mpesa_receipt || '',
      amount: booking.listing_price,
      booking_id: booking.id,
      listing_id: booking.listing_id,
      listing_title: booking.listing_title,
      listing_status: listingStatus,
      lister,
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}