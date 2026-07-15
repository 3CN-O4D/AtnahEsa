import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MIN_BOOKING_FEE } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listing_id } = await req.json()

    // Get listing to verify price
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('price')
      .eq('id', listing_id)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.price < MIN_BOOKING_FEE) {
      return NextResponse.json(
        { error: `Minimum booking fee is ${MIN_BOOKING_FEE}` },
        { status: 400 }
      )
    }

    // TODO: Process payment with payment gateway (M-Pesa, Stripe, etc.)
    // const paymentResult = await processPayment(user.id, listing.price)

    const { error } = await supabase.from('bookings').insert({
      listing_id,
      user_id: user.id,
      amount: listing.price,
      status: 'pending', // TODO: set to 'confirmed' after payment success
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
