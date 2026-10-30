import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyHouseBookingPayment, PaymentError } from '@/lib/payments'

/**
 * Payment status endpoint used by the payment page.
 * Accepts either a house-booking id or a PayWave transaction request id.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const bookingIdInput = typeof body.booking_id === 'string' ? body.booking_id : ''
    const trxInput =
      typeof body.transaction_request_id === 'string'
        ? body.transaction_request_id
        : typeof body.checkout_request_id === 'string'
          ? body.checkout_request_id
          : ''

    if (!bookingIdInput && !trxInput) {
      return NextResponse.json({ error: 'booking_id or transaction_request_id is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const isAdmin = profile?.role === 'admin'

    let bookingId = bookingIdInput

    if (!bookingId && trxInput) {
      const { data: tx } = await admin
        .from('transactions')
        .select('user_id, raw_callback')
        .or(`originator_conversation_id.eq.${trxInput},checkout_request_id.eq.${trxInput}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      if (!isAdmin && tx.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const linked =
        tx.raw_callback && typeof tx.raw_callback === 'object'
          ? (tx.raw_callback as Record<string, unknown>).house_booking_id
          : null
      if (typeof linked !== 'string') {
        return NextResponse.json({ error: 'Transaction is not linked to a booking' }, { status: 404 })
      }
      bookingId = linked
    }

    const result = await verifyHouseBookingPayment(admin, { bookingId, userId: user.id, isAdmin })

    return NextResponse.json({
      success: true,
      status: result.status,
      confirmed: result.status === 'Completed',
      amount: result.amount ?? result.booking.listing_price,
      receipt: result.receipt || result.booking.mpesa_receipt,
      booking_status: result.booking.status,
      release_status: result.booking.release_status,
      held_until: result.booking.held_until,
    })
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    }
    console.error('payments/status error:', err)
    return NextResponse.json({ error: 'Failed to query status' }, { status: 500 })
  }
}
