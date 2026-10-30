import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyHouseBookingPayment, PaymentError } from '@/lib/payments'

/**
 * Ask PayWave for the latest status of a house-booking payment.
 * Confirmation is idempotent, so polling this endpoint is safe.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id : ''

    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to check this payment' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()

    const result = await verifyHouseBookingPayment(admin, {
      bookingId,
      userId: user.id,
      isAdmin: profile?.role === 'admin',
    })

    const confirmed = result.status === 'Completed'
    return NextResponse.json({
      success: true,
      status: result.status,
      confirmed,
      already_processed: result.alreadyProcessed,
      amount: result.amount ?? result.booking.listing_price,
      receipt: result.receipt || result.booking.mpesa_receipt,
      booking_status: result.booking.status,
      release_status: result.booking.release_status,
      held_until: result.booking.held_until,
    })
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code, ...(err.details || {}) }, { status: err.status })
    }
    console.error('payments/verify error:', err)
    return NextResponse.json({ error: 'Could not check the payment status' }, { status: 500 })
  }
}
