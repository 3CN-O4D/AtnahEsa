import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MIN_BOOKING_FEE } from '@/lib/constants'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listing_id } = await req.json()

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('title, price, location, status, uploader_id')
      .eq('id', listing_id)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    if (listing.uploader_id === user.id) {
      return NextResponse.json({ error: 'You cannot book your own listing' }, { status: 400 })
    }

    if (listing.status !== 'published') {
      return NextResponse.json({ error: 'Listing is not available for booking' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('listing_id', listing_id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'You already have a pending booking for this listing' }, { status: 400 })
    }

    if (listing.price < MIN_BOOKING_FEE) {
      return NextResponse.json(
        { error: `Minimum booking fee is ${MIN_BOOKING_FEE}` },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('bookings').insert({
      listing_id,
      user_id: user.id,
      amount: listing.price,
      status: 'pending',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    notifyAdmins(
      'New House Booking',
      'Booking Request',
      { User: user.email || 'N/A', Listing: listing.title || 'N/A', Location: listing.location || 'N/A', Amount: `KES ${listing.price}` }
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
