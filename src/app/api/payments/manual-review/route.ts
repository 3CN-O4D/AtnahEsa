import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitManualPaymentReview, PaymentError } from '@/lib/payments'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { notifyAdmins } from '@/lib/notify'

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

    // The failure callback deliberately stays quiet. This is the first moment
    // admins get an email, and it carries everything needed to verify the claim.
    after(async () => {
      const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://asehanta.com').replace(/\/$/, '')
      const booking = result.booking
      const details: Record<string, string> = {
        'Booking reference': `${booking.id.slice(0, 8).toUpperCase()} (${booking.id})`,
        Listing: booking.listing_title || booking.listing_id,
        Location: booking.listing_location || 'N/A',
        'Booking fee': `KES ${Number(booking.listing_price || result.amount).toLocaleString()}`,
        Hunter: booking.name || 'N/A',
        'Hunter phone': booking.phone || 'N/A',
        'Hunter email': booking.email || 'N/A',
        'M-Pesa receipt': result.receipt,
        'M-Pesa message': mpesaMessage.trim(),
        'PayWave check': result.autoConfirmed
          ? 'Matched PayWave and opened escrow automatically.'
          : result.reviewNote || 'PayWave could not confirm this payment automatically.',
        'Submitted at': new Date().toISOString(),
        'Review queue': `${site}/admin/booking-reviews`,
        'Action needed': result.autoConfirmed
          ? 'No action required — the payment is already verified and in escrow.'
          : 'Open Payment claims in the admin queue, match the SMS to the booking, then approve the payment and open escrow. Do not ask the hunter to pay again.',
      }

      if (result.autoConfirmed) {
        await notifyAdmins('Manual Payment Verified', 'Payment Verified Automatically', details)
      } else {
        await notifyAdmins(
          'Manual Payment Submitted for Verification',
          'Payment Needs Admin Verification',
          details
        )
      }
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
