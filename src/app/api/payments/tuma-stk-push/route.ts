import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tumaStkPush, normalizeKenyanPhone } from '@/lib/tuma'
import { notifyAdmins } from '@/lib/notify'

/**
 * Initiate a Tuma (I&M Bank) STK push for a house booking.
 * Public flow (no auth) mirroring the WhatsApp/Till booking path.
 * On success the customer gets an M-Pesa prompt; Tuma confirms via
 * /api/payments/tuma-callback.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { listing_id, listing_location, listing_price, phone } = body

    if (!listing_id || !phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    if (!normalizeKenyanPhone(phone)) {
      return NextResponse.json({ error: 'Enter a valid Kenyan phone number (e.g. 0726 498 682)' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: listing } = await supabase
      .from('listings')
      .select('id, title, price, status')
      .eq('id', listing_id)
      .single()

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.status !== 'published') {
      return NextResponse.json({ error: 'This house is no longer available for booking' }, { status: 400 })
    }

    const amount = listing_price || listing.price || 0
    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid booking fee' }, { status: 400 })
    }

    const normalizedPhone = normalizeKenyanPhone(phone) || phone

    const { data: booking, error: bookingError } = await supabase
      .from('house_bookings')
      .insert({
        listing_id: listing.id,
        listing_title: listing.title,
        listing_location: listing_location || '',
        listing_price: amount,
        name: '',
        phone: normalizedPhone,
        area: '',
        status: 'pending',
      })
      .select()
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    let result: { merchant_request_id: string; checkout_request_id: string; customer_message?: string }
    try {
      result = await tumaStkPush(normalizedPhone, amount, `Book ${listing.title}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate payment'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    await supabase.from('transactions').insert({
      listing_id: listing.id,
      phone: normalizedPhone,
      amount,
      checkout_request_id: result.checkout_request_id,
      merchant_request_id: result.merchant_request_id,
      status: 'pending',
      raw_callback: { house_booking_id: booking.id },
    })

    notifyAdmins(
      'STK Push Initiated',
      'Tuma Payment Request',
      {
        Phone: normalizedPhone,
        Listing: listing.title,
        Amount: `KES ${amount}`,
        'Merchant Request ID': result.merchant_request_id || 'N/A',
        'Checkout ID': result.checkout_request_id || 'N/A',
      }
    )

    return NextResponse.json({
      success: true,
      checkout_request_id: result.checkout_request_id,
      merchant_request_id: result.merchant_request_id,
      customer_message: result.customer_message || 'Check your phone for the M-Pesa prompt.',
      booking_id: booking.id,
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}