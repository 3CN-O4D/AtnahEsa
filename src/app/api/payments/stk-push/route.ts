import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stkPush } from '@/lib/daraja'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listing_id, phone } = await req.json()

    if (!listing_id || !phone) {
      return NextResponse.json({ error: 'Missing listing_id or phone' }, { status: 400 })
    }

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, title, price, status')
      .eq('id', listing_id)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.status !== 'published') {
      return NextResponse.json({ error: 'Listing is not available for booking' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        listing_id: listing.id,
        user_id: user.id,
        amount: listing.price,
        phone,
        status: 'pending',
      })
      .select()
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    const result = await stkPush(phone, listing.price, listing.id.slice(0, 12), `Book ${listing.title}`)

    const { error: txError } = await supabase.from('transactions').insert({
      booking_id: booking.id,
      user_id: user.id,
      phone,
      amount: listing.price,
      checkout_request_id: result.CheckoutRequestID || '',
      status: 'pending',
      raw_callback: result,
    })

    if (txError) {
      console.error('Failed to log transaction:', txError)
    }

    return NextResponse.json({
      success: true,
      checkout_request_id: result.CheckoutRequestID,
      merchant_request_id: result.MerchantRequestID,
      response_code: result.ResponseCode,
      response_desc: result.ResponseDescription,
    })
  } catch (err) {
    console.error('STK push error:', err)
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 })
  }
}