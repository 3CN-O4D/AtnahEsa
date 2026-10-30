import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReceiptPdf } from '@/lib/receipt'

/**
 * Admin receipt generator.
 *
 * Accepts `booking_id`, `transaction_id` or `receipt` (M-Pesa/PayWave
 * reference) and renders the same branded PDF the payment flow emails.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const params = new URL(request.url).searchParams

  // JSON list mode for the generator page.
  if (params.get('list') === '1') {
    const adminList = createAdminClient()
    const { data, error } = await adminList
      .from('house_bookings')
      .select('id, listing_title, listing_location, listing_price, name, email, phone, mpesa_receipt, paid_at, created_at, release_status, payment_method')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  const bookingId = params.get('booking_id')
  const transactionId = params.get('transaction_id')
  const receipt = params.get('receipt')

  if (!bookingId && !transactionId && !receipt) {
    return NextResponse.json(
      { error: 'Provide booking_id, transaction_id or receipt' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  let resolvedBookingId = bookingId

  if (!resolvedBookingId && transactionId) {
    const { data: tx } = await admin
      .from('transactions')
      .select('booking_id')
      .eq('id', transactionId)
      .maybeSingle()
    resolvedBookingId = tx?.booking_id ?? null
  }

  if (!resolvedBookingId && receipt) {
    const { data: booking } = await admin
      .from('house_bookings')
      .select('id')
      .eq('mpesa_receipt', receipt)
      .maybeSingle()
    resolvedBookingId = booking?.id ?? null
  }

  if (!resolvedBookingId) {
    return NextResponse.json({ error: 'No booking found for that reference' }, { status: 404 })
  }

  const { data: booking, error } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', resolvedBookingId)
    .maybeSingle()

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  let listerName: string | undefined
  if (booking.listing_id) {
    const { data: listing } = await admin
      .from('listings')
      .select('uploader_name')
      .eq('id', booking.listing_id)
      .maybeSingle()
    listerName = listing?.uploader_name || undefined
  }

  const pdf = await generateReceiptPdf({
    bookingId: booking.id,
    receiptNumber: booking.mpesa_receipt || booking.id.slice(0, 12).toUpperCase(),
    listingTitle: booking.listing_title || 'House listing',
    listingLocation: booking.listing_location || '',
    amount: Number(booking.listing_price) || 0,
    payerName: booking.name || '',
    payerEmail: booking.email || '',
    payerPhone: booking.phone || '',
    paidAt: booking.paid_at || booking.created_at,
    heldUntil: booking.held_until,
    paymentMethod: booking.payment_method || 'paywave',
    listerName,
  })

  const filename = `asehanta-receipt-${(booking.mpesa_receipt || booking.id.slice(0, 8)).replace(/[^A-Za-z0-9-]/g, '')}.pdf`

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
