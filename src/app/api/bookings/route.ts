import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const { listing_id, amount, phone, email } = await req.json()
    if (!listing_id || !amount || !phone || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: listing } = await admin
      .from('listings')
      .select('id, title, price, status, uploader_id')
      .eq('id', listing_id)
      .single()

    if (!listing || listing.status !== 'published') {
      return NextResponse.json({ error: 'Listing not available' }, { status: 400 })
    }

    if (listing.uploader_id === user.id) {
      return NextResponse.json({ error: 'Cannot book your own listing' }, { status: 400 })
    }

    // --- H2: VALIDATE AMOUNT AGAINST LISTING PRICE ---
    const listingPrice = listing.price || 0
    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Invalid booking fee' }, { status: 400 })
    }
    if (amount !== listingPrice) {
      return NextResponse.json({ error: `Amount must be exactly KES ${listingPrice}` }, { status: 400 })
    }
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
    const { initiateStkPush } = await import('@/lib/paywave')
    const stkResult = await initiateStkPush({ email, amount, msisdn: phone, reference: booking.id })

    // Create escrow hold
    const { createEscrowHold } = await import('@/lib/escrow')
    await createEscrowHold({
      bookingId: booking.id,
      hunterId: user.id,
      listerId: listing.uploader_id,
      amount: amount,
      listingTitle: listing.title,
    })

    // Notify
    await import('@/lib/notify').then(({ notifyAdmins }) => notifyAdmins(
      'New Booking Request',
      'PayWave Payment Initiated',
      { Hunter: user.email || 'N/A', Listing: listing.title, Amount: `KES ${amount}`, Phone: phone }
    ))

    return NextResponse.json({
      success: true,
      checkoutRequestID: stkResult.checkoutRequestID,
      merchantRequestID: stkResult.merchantRequestID,
      customerMessage: stkResult.customerMessage,
      bookingId: booking.id,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
