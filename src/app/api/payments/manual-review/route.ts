import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitManualPaymentReview, PaymentError } from '@/lib/payments'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

/**
 * Callback never arrived? The hunter pastes the M-Pesa SMS here.
 * This marks the payment as "under review" and alerts admins — it never
 * confirms money by itself.
 */
export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429, headers })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id : ''
    const mpesaMessage = typeof body.mpesa_message === 'string' ? body.mpesa_message : ''

    if (!bookingId || !mpesaMessage.trim()) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Paste the M-Pesa message and try again' }, { status: 400 })
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return addSecurityHeaders(NextResponse.json({ error: 'Please sign in to continue' }, { status: 401 }))
    }

    const admin = createAdminClient()
    const result = await submitManualPaymentReview(admin, {
      bookingId,
      userId: user.id,
      mpesaMessage,
    })

    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        message: result.autoConfirmed
          ? `Payment verified with PayWave. KES ${result.amount.toLocaleString()} is now held in escrow. Your receipt is ready below.`
          : result.reviewNote
            ? `Thanks — your message is under review. ${result.reviewNote}`
            : 'Thanks — your payment is now under review. An admin will confirm it and open escrow, usually within a few minutes.',
        receipt: result.receipt,
        amount: result.amount,
        status: result.autoConfirmed ? 'completed' : 'verifying',
        auto_confirmed: result.autoConfirmed,
      })
    )
  } catch (err) {
    if (err instanceof PaymentError) {
      return addSecurityHeaders(
        NextResponse.json({ error: err.message, code: err.code, ...(err.details || {}) }, { status: err.status })
      )
    }
    console.error('payments/manual-review error:', err)
    return addSecurityHeaders(
      NextResponse.json({ error: 'Could not submit your payment message. Please try again.' }, { status: 500 })
    )
  }
}
