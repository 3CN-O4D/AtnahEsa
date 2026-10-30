import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { initiateHouseBookingPayment, PaymentError } from '@/lib/payments'
import { isValidPhone } from '@/lib/whatsapp'

/**
 * Legacy entry point kept for older clients. It now uses the same exact-amount
 * engine as /api/payments/initiate: the amount always comes from the listing.
 */
export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const body = await req.json().catch(() => ({}))
    const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const emailInput = typeof body.email === 'string' ? body.email.trim() : ''

    if (!listingId || !phone) {
      return addSecurityHeaders(NextResponse.json({ error: 'Missing listing or phone' }, { status: 400 }))
    }
    if (!isValidPhone(phone)) {
      return addSecurityHeaders(NextResponse.json({ error: 'Enter a valid Kenyan phone number' }, { status: 400 }))
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const email = emailInput || user.email || ''
    if (!email) {
      return addSecurityHeaders(NextResponse.json({ error: 'Add an email to your profile first' }, { status: 400 }))
    }

    const admin = createAdminClient()
    const result = await initiateHouseBookingPayment(admin, {
      listingId,
      userId: user.id,
      userName: user.user_metadata?.full_name || user.email || '',
      phone,
      email,
    })

    // Keep both naming styles so older booking UIs keep working during deploy.
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        bookingId: result.bookingId,
        booking_id: result.bookingId,
        transactionId: result.transactionId,
        transaction_id: result.transactionId,
        transactionRequestID: result.transactionRequestId,
        transaction_request_id: result.transactionRequestId,
        customerMessage: result.customerMessage,
        customer_message: result.customerMessage,
        amount: result.amount,
      })
    )
  } catch (err) {
    if (err instanceof PaymentError) {
      return addSecurityHeaders(
        NextResponse.json({ error: err.message, code: err.code, ...(err.details || {}) }, { status: err.status })
      )
    }
    console.error('house-bookings error:', err)
    return addSecurityHeaders(NextResponse.json({ error: 'Could not start the payment' }, { status: 500 }))
  }
}
