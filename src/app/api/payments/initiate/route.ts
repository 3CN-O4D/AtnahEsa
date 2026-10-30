import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { initiateHouseBookingPayment, PaymentError } from '@/lib/payments'
import { isValidPhone } from '@/lib/whatsapp'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many payment attempts. Wait a minute and try again.' }, { status: 429, headers })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const listingId = typeof body.listing_id === 'string' ? body.listing_id : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const emailInput = typeof body.email === 'string' ? body.email.trim() : ''

    if (!listingId) {
      return addSecurityHeaders(NextResponse.json({ error: 'Missing listing' }, { status: 400 }))
    }
    if (!phone || !isValidPhone(phone)) {
      return addSecurityHeaders(NextResponse.json({ error: 'Enter a valid M-Pesa phone number' }, { status: 400 }))
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return addSecurityHeaders(NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 }))
    }

    const email = emailInput || user.email || ''
    if (!email) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Add an email to your profile so we can send your receipt' }, { status: 400 })
      )
    }

    const admin = createAdminClient()
    const result = await initiateHouseBookingPayment(admin, {
      listingId,
      userId: user.id,
      userName: user.user_metadata?.full_name || user.email || '',
      phone,
      email,
    })

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        booking_id: result.bookingId,
        transaction_id: result.transactionId,
        transaction_request_id: result.transactionRequestId,
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
    console.error('payments/initiate error:', err)
    return addSecurityHeaders(NextResponse.json({ error: 'Could not start the payment. Please try again.' }, { status: 500 }))
  }
}
