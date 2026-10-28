import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tumaStkPush, normalizeKenyanPhone } from '@/lib/tuma'
import { notifyAdmins } from '@/lib/notify'
import { withRateLimit, addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS } from '@/lib/security'

/**
 * Initiate a Tuma (I&M Bank) STK push for a house booking.
 * Public flow (no auth) mirroring the WhatsApp/Till booking path.
 * On success the customer gets an M-Pesa prompt; Tuma confirms via
 * /api/payments/tuma-callback.
 */
export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many payment attempts. Try again shortly.' }, { status: 429, headers })
  }

  try {
    const body = await req.json()
    const validation = validateRequest(VALIDATION_SCHEMAS.bookingCreate, body)
    if (!validation.success) {
      const resp = validation.error
      return addSecurityHeaders(resp)
    }

    const { listing_id, listing_location, listing_price, phone, name, area, id_number } = validation.data

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: listing } = await supabase
      .from('listings')
      .select('id, title, price, status')
      .eq('id', listing_id)
      .single()

    if (!listing) {
      const resp = NextResponse.json({ error: 'Listing not found' }, { status: 404 })
      return addSecurityHeaders(resp)
    }

    if (listing.status !== 'published') {
      const resp = NextResponse.json({ error: 'This house is no longer available for booking' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const amount = listing_price || listing.price || 0
    if (!amount || amount < 1) {
      const resp = NextResponse.json({ error: 'Invalid booking fee' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const normalizedPhone = normalizeKenyanPhone(phone) || phone
    if (!normalizedPhone || !/^\+254[17]\d{8}$/.test(normalizedPhone)) {
      const resp = NextResponse.json({ error: 'Enter a valid Kenyan phone number (e.g. 0726 498 682)' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const { data: booking, error: bookingError } = await supabase
      .from('house_bookings')
      .insert({
        listing_id: listing.id,
        listing_title: listing.title,
        listing_location: listing_location || '',
        listing_price: amount,
        name: name || '',
        phone: normalizedPhone,
        area: area || '',
        id_number: id_number || '',
        user_id: user?.id || null,
        payment_method: 'tuma',
        status: 'pending',
      })
      .select()
      .single()

    if (bookingError) {
      const resp = NextResponse.json({ error: bookingError.message }, { status: 500 })
      return addSecurityHeaders(resp)
    }

    let result: { merchant_request_id: string; checkout_request_id: string; customer_message?: string }
    try {
      result = await tumaStkPush(normalizedPhone, amount, `Book ${listing.title}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate payment'
      const resp = NextResponse.json({ error: message }, { status: 502 })
      return addSecurityHeaders(resp)
    }

    await supabase.from('transactions').insert({
      listing_id: listing.id,
      phone: normalizedPhone,
      amount,
      checkout_request_id: result.checkout_request_id,
      merchant_request_id: result.merchant_request_id,
      status: 'pending',
      payment_method: 'tuma',
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

    const resp = NextResponse.json({
      success: true,
      checkout_request_id: result.checkout_request_id,
      merchant_request_id: result.merchant_request_id,
      customer_message: result.customer_message || 'Check your phone for the M-Pesa prompt.',
      booking_id: booking.id,
    })
    return addSecurityHeaders(resp)
  } catch {
    const resp = NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    return addSecurityHeaders(resp)
  }
}