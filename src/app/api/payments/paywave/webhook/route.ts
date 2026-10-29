import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { moveMediaToTaken } from '@/lib/move-media'
import { releaseToLister, refundHunter } from '@/lib/escrow'
import { verifyWebhookSignature } from '@/lib/paywave'
import { addSecurityHeaders } from '@/lib/security'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-paywave-signature') || ''

    if (!verifyWebhookSignature(rawBody, signature)) {
      return addSecurityHeaders(NextResponse.json({ error: 'Invalid signature' }, { status: 401 }))
    }

    const payload = JSON.parse(rawBody)
    const { event, data } = payload

    const admin = createAdminClient()

    // --- IDEMPOTENCY CHECK (C4) ---
    // Track processed checkoutRequestIDs to prevent duplicate processing
    const { data: existingWebhook } = await admin
      .from('paywave_webhook_events')
      .select('id')
      .eq('checkout_request_id', data.checkoutRequestID)
      .maybeSingle()

    if (existingWebhook) {
      // Already processed this webhook — return success without side effects
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Already processed' }))
    }

    // Record this webhook event BEFORE processing (idempotency)
    await admin
      .from('paywave_webhook_events')
      .insert({
        checkout_request_id: data.checkoutRequestID,
        event,
        amount: data.amount,
        received_at: new Date().toISOString(),
        payload: rawBody,
      })

    const { data: booking } = await admin
      .from('house_bookings')
      .select('*')
      .eq('id', data.reference)
      .single()

    if (!booking) {
      console.error('Booking not found for reference:', data.reference)
      return addSecurityHeaders(NextResponse.json({ error: 'Booking not found' }, { status: 404 }))
    }

    // --- AMOUNT VERIFICATION (C3) ---
    // Ensure the webhook amount matches the booking amount
    const webhookAmount = parseInt(data.amount)
    if (isNaN(webhookAmount) || webhookAmount !== booking.listing_price) {
      console.error(
        `Amount mismatch for booking ${booking.id}: webhook=${webhookAmount}, booking=${booking.listing_price}`
      )
      return addSecurityHeaders(
        NextResponse.json({ error: 'Amount mismatch' }, { status: 400 })
      )
    }

    const { data: escrow } = await admin
      .from('escrow_holds')
      .select('*')
      .eq('house_booking_id', booking.id) // Use house_booking_id column
      .single()

    if (!escrow) {
      console.error('Escrow not found for booking:', booking.id)
      return addSecurityHeaders(NextResponse.json({ error: 'Escrow not found' }, { status: 404 }))
    }

    // --- STATE CHECK (H4) ---
    // Don't process if already confirmed/refunded
    if (booking.status === 'confirmed' || booking.status === 'refunded') {
      console.log(`Booking ${booking.id} already in status ${booking.status}, skipping`)
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Already processed' }))
    }

    if (event === 'stkpush.success') {
      await admin.from('house_bookings').update({
        status: 'confirmed',
        mpesa_receipt: data.mpesaReceiptNumber,
        release_status: 'held',
        confirmed_at: new Date().toISOString(),
      }).eq('id', booking.id)

      await admin.from('escrow_holds').update({
        status: 'held',
        held_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', escrow.id)

      await moveMediaToTaken(booking.listing_id)

      await Promise.all([
        createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Payment Confirmed',
          body: `Payment of KES ${data.amount} confirmed. 24-hour view window started.`,
          link: '/my-bookings?tab=payments',
        }),
        createNotification({
          userId: booking.uploader_id || booking.listing_id,
          category: 'transaction',
          title: 'New Booking Payment',
          body: `Hunter paid KES ${data.amount}. 24-hour view window started.`,
          link: '/my-bookings?tab=payments',
        }),
      ])

    } else if (event === 'stkpush.failed' || event === 'stkpush.timeout') {
      await admin.from('house_bookings').update({
        status: 'failed',
        release_status: 'failed',
      }).eq('id', booking.id)

      await admin.from('escrow_holds').update({
        status: 'refunded',
        action: 'payment_failed',
      }).eq('id', escrow.id)

      await createNotification({
        userId: booking.user_id,
        category: 'transaction',
        title: 'Payment Failed',
        body: `Payment of KES ${data.amount} failed. Please try again.`,
        link: '/my-bookings?tab=payments',
      })
    }

    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch (err) {
    console.error('PayWave webhook error:', err)
    // Return proper error so PayWave retries, instead of silently swallowing
    return addSecurityHeaders(NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 }))
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
