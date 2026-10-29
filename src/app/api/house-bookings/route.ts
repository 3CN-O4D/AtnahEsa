import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createEscrowHold } from '@/lib/escrow'
import { initiateStkPush } from '@/lib/paywave'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { createNotification } from '@/lib/notifications'
import { moveMediaToTaken } from '@/lib/move-media'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const body = await req.json()
    const { listing_id, amount, phone, email } = body

    if (!listing_id || !amount || !phone || !email) {
      return addSecurityHeaders(NextResponse.json({ error: 'Missing required fields' }, { status: 400 }))
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const admin = createAdminClient()

    const { data: listing } = await admin
      .from('listings')
      .select('id, title, price, status, uploader_id')
      .eq('id', listing_id)
      .single()

    if (!listing || listing.status !== 'published') {
      return addSecurityHeaders(NextResponse.json({ error: 'Listing not available' }, { status: 400 }))
    }

    if (listing.uploader_id === user.id) {
      return addSecurityHeaders(NextResponse.json({ error: 'Cannot book your own listing' }, { status: 400 }))
    }

    // Create booking
    const { data: booking, error: bookingError } = await admin
      .from('house_bookings')
      .insert({
        listing_id: listing.id,
        listing_title: listing.title,
        listing_price: amount,
        phone,
        email,
        user_id: user.id,
        payment_method: 'paywave',
        status: 'pending',
      })
      .select()
      .single()

    if (bookingError) throw bookingError

    // Initiate PayWave STK Push
    const stkResult = await initiateStkPush({
      email,
      amount,
      msisdn: phone,
      reference: booking.id,
    })

    // Create escrow hold
    await createEscrowHold({
      bookingId: booking.id,
      hunterId: user.id,
      listerId: listing.uploader_id,
      amount: amount,
      listingTitle: listing.title,
    })

    // Notify lister
    await createNotification({
      userId: listing.uploader_id,
      category: 'transaction',
      title: 'New Booking Request',
      body: `Hunter initiated payment for "${listing.title}". Awaiting payment confirmation.`,
      link: '/my-bookings?tab=payments',
    })

    return addSecurityHeaders(NextResponse.json({
      success: true,
      checkoutRequestID: stkResult.checkoutRequestID,
      merchantRequestID: stkResult.merchantRequestID,
      customerMessage: stkResult.customerMessage,
      bookingId: booking.id,
    }))
  } catch (err) {
    console.error('house-bookings error:', err)
    return addSecurityHeaders(NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 }))
  }
}
