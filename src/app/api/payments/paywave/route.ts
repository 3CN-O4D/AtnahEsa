import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  initiateStkPush,
  verifyTransaction,
  parseWebhookPayload,
  extractTransactionCode,
  isValidMpesaMessage,
  extractAmountFromMessage,
} from '@/lib/paywave'
import { releaseToLister, refundHunter, createEscrowHold } from '@/lib/escrow'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'
import { createNotification } from '@/lib/notifications'

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'payments')
  if (!allowed) {
    const response = NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    return addSecurityHeaders(response)
  }

  try {
    const { action, ...params } = await req.json()
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addSecurityHeaders(response)
    }

    switch (action) {
      case 'stkpush': {
        const { listing_id, amount, phone, email, reference } = params
        if (!listing_id || !amount || !phone || !email) {
          const response = NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const { data: listing } = await admin
          .from('listings')
          .select('id, title, price, status, uploader_id')
          .eq('id', listing_id)
          .single()

        if (!listing || listing.status !== 'published') {
          const response = NextResponse.json({ error: 'Listing not available' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        if (listing.uploader_id === user.id) {
          const response = NextResponse.json({ error: 'Cannot book your own listing' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const listingPrice = listing.price || 0
        if (!amount || amount < 1) {
          const response = NextResponse.json({ error: 'Invalid booking fee' }, { status: 400 })
          return addSecurityHeaders(response)
        }
        if (amount !== listingPrice) {
          const response = NextResponse.json({ error: `Amount must be exactly KES ${listingPrice}` }, { status: 400 })
          return addSecurityHeaders(response)
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
            release_status: 'pending',
          })
          .select()
          .single()

        if (bookingError) throw bookingError

        const stkResult = await initiateStkPush({
          email,
          amount,
          msisdn: phone,
          reference: booking.id,
        })

        await createEscrowHold({
          bookingId: booking.id,
          hunterId: user.id,
          listerId: listing.uploader_id,
          amount,
          listingTitle: listing.title,
        })

        await createNotification({
          userId: listing.uploader_id,
          category: 'transaction',
          title: 'New Booking Request',
          body: `Hunter initiated payment for "${listing.title}". Awaiting payment confirmation.`,
          link: '/my-bookings?tab=payments',
        })

        return addSecurityHeaders(NextResponse.json({
          success: true,
          transactionRequestID: stkResult.transactionRequestID,
          merchantRequestID: stkResult.merchantRequestID,
          checkoutRequestID: stkResult.checkoutRequestID,
          customerMessage: stkResult.customerMessage,
          bookingId: booking.id,
        }))
      }

      case 'verify': {
        const { booking_id, transaction_request_id } = params
        if (!booking_id || !transaction_request_id) {
          const response = NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const { data: booking } = await admin
          .from('house_bookings')
          .select('*')
          .eq('id', booking_id)
          .single()

        if (!booking || booking.user_id !== user.id) {
          const response = NextResponse.json({ error: 'Not your booking' }, { status: 403 })
          return addSecurityHeaders(response)
        }

        const status = await verifyTransaction(transaction_request_id)
        const isCompleted = status.TransactionStatus === 'Completed'

        if (isCompleted) {
          const webhookAmount = parseInt(status.TransactionAmount || '0')
          if (isNaN(webhookAmount) || webhookAmount !== booking.listing_price) {
            const response = NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
            return addSecurityHeaders(response)
          }

          await admin.from('house_bookings').update({
            status: 'confirmed',
            mpesa_receipt: status.TransactionReceipt,
            release_status: 'held',
            confirmed_at: new Date().toISOString(),
          }).eq('id', booking.id)

          await admin.from('escrow_holds').update({
            status: 'held',
            held_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }).eq('booking_id', booking.id)

          await createNotification({
            userId: booking.user_id,
            category: 'transaction',
            title: 'Payment Confirmed',
            body: `Payment of KES ${status.TransactionAmount} confirmed. 24-hour view window started.`,
            link: '/my-bookings?tab=payments',
          })
          await createNotification({
            userId: booking.listing_id || '',
            category: 'transaction',
            title: 'New Booking Payment',
            body: `Hunter paid KES ${status.TransactionAmount}. 24-hour view window started.`,
            link: '/my-bookings?tab=payments',
          })
        }

        return addSecurityHeaders(NextResponse.json({
          success: true,
          status: status.TransactionStatus,
          receipt: status.TransactionReceipt,
          amount: status.TransactionAmount,
        }))
      }

      case 'manual_refund': {
        const { booking_id, escrow_id, mpesa_message, reason } = params
        if (!booking_id || !mpesa_message) {
          const response = NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const { data: booking } = await admin
          .from('house_bookings')
          .select('*')
          .eq('id', booking_id)
          .single()

        if (!booking || booking.user_id !== user.id) {
          const response = NextResponse.json({ error: 'Not your booking' }, { status: 403 })
          return addSecurityHeaders(response)
        }

        if (!isValidMpesaMessage(mpesa_message)) {
          const response = NextResponse.json({ error: 'Invalid M-Pesa confirmation message' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const transactionCode = extractTransactionCode(mpesa_message)
        const refundAmount = extractAmountFromMessage(mpesa_message) || booking.listing_price

        if (!transactionCode) {
          const response = NextResponse.json({ error: 'Could not find transaction code in message' }, { status: 400 })
          return addSecurityHeaders(response)
        }

        const isFullRefund = ['fake_listing', 'no_show'].includes(reason)
        const refundPercent = isFullRefund ? 1.0 : 0.85
        const refundAmt = Math.round(refundAmount * refundPercent)

        await refundHunter({
          escrowId: escrow_id || '',
          reason: isFullRefund ? 'fake_listing' : 'viewed_changed_mind',
          actorId: user.id,
          customReason: reason,
        })

        await admin.from('house_bookings').update({
          release_status: 'refunded',
          mpesa_message,
          refunded_at: new Date().toISOString(),
        }).eq('id', booking.id)

        await createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Refund Processed',
          body: `Manual refund of KES ${refundAmt.toLocaleString()} processed.`,
          link: '/my-bookings?tab=refunds',
        })

        await createNotification({
          userId: booking.listing_id || '',
          category: 'transaction',
          title: 'Booking Refunded',
          body: `A booking for "${booking.listing_title}" was manually refunded (${reason}).`,
          link: '/my-bookings?tab=payments',
        })

        return addSecurityHeaders(NextResponse.json({
          success: true,
          message: isFullRefund ? '100% refund initiated' : '85% refund initiated',
          refundAmount: refundAmt,
          transactionCode,
        }))
      }

      default:
        const response = NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        return addSecurityHeaders(response)
    }
  } catch (err) {
    const response = NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
    return addSecurityHeaders(response)
  }
}
