import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyUser, notifyAdmins } from '@/lib/notify'
import { moveMediaToTaken } from '@/lib/move-media'
import { parseWebhookPayload } from '@/lib/paywave'
import { addSecurityHeaders } from '@/lib/security'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const payload = parseWebhookPayload(rawBody)

    if (!payload) {
      return addSecurityHeaders(NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 }))
    }

    const { ResponseCode, ResponseDescription, MerchantRequestID, CheckoutRequestID,
      TransactionID, TransactionAmount, TransactionReceipt, TransactionDate,
      TransactionReference, Msisdn } = payload

    const admin = createAdminClient()

    // Idempotency check
    const { data: existingWebhook } = await admin
      .from('paywave_webhook_events')
      .select('id')
      .eq('checkout_request_id', CheckoutRequestID)
      .maybeSingle()

    if (existingWebhook) {
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Already processed' }))
    }

    await admin
      .from('paywave_webhook_events')
      .insert({
        checkout_request_id: CheckoutRequestID,
        event: ResponseCode === 0 ? 'stkpush.success' : 'stkpush.failed',
        amount: TransactionAmount,
        received_at: new Date().toISOString(),
        payload: rawBody,
      })

    const { data: booking } = await admin
      .from('house_bookings')
      .select('*')
      .eq('id', TransactionReference)
      .single()

    if (!booking) {
      console.error('Booking not found for reference:', TransactionReference)
      return addSecurityHeaders(NextResponse.json({ error: 'Booking not found' }, { status: 404 }))
    }

    // Amount verification
    const webhookAmount = parseInt(String(TransactionAmount || 0))
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
      .eq('booking_id', booking.id)
      .single()

    if (!escrow) {
      console.error('Escrow not found for booking:', booking.id)
      return addSecurityHeaders(NextResponse.json({ error: 'Escrow not found' }, { status: 404 }))
    }

    // State check
    if (booking.status === 'confirmed' || booking.status === 'refunded') {
      console.log(`Booking ${booking.id} already in status ${booking.status}, skipping`)
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Already processed' }))
    }

    if (ResponseCode === 0) {
      await admin.from('house_bookings').update({
        status: 'confirmed',
        mpesa_receipt: TransactionReceipt,
        release_status: 'held',
        confirmed_at: TransactionDate || new Date().toISOString(),
      }).eq('id', booking.id)

      await admin.from('escrow_holds').update({
        status: 'held',
        held_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', escrow.id)

      await moveMediaToTaken(booking.listing_id)

      // Fetch emails for 3-way notification
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', [booking.user_id, booking.listing_id || booking.uploader_id])
      const emailById: Record<string, { email: string; full_name: string }> = {}
      for (const p of (profiles ?? [])) {
        emailById[p.id] = { email: p.email || '', full_name: p.full_name || '' }
      }
      const hunterEmail = emailById[booking.user_id]?.email
      const hunterName = emailById[booking.user_id]?.full_name || 'Hunter'
      const listerId = booking.listing_id || booking.uploader_id || ''
      const listerEmail = emailById[listerId]?.email
      const listerName = emailById[listerId]?.full_name || 'Lister'

      await Promise.all([
        createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Payment Confirmed',
          body: `Payment of KES ${TransactionAmount} confirmed. 24-hour view window started.`,
          link: '/my-bookings?tab=payments',
        }),
        createNotification({
          userId: booking.uploader_id || booking.listing_id,
          category: 'transaction',
          title: 'New Booking Payment',
          body: `Hunter paid KES ${TransactionAmount}. 24-hour view window started.`,
          link: '/my-bookings?tab=payments',
        }),
      ])

      // --- 3-WAY EMAIL NOTIFICATIONS ON PAYMENT CONFIRMED ---
      if (hunterEmail) {
        await notifyUser(hunterEmail, 'Payment Confirmed — Money in Escrow', 'Payment Received', {
          Listing: booking.listing_id,
          Amount: `KES ${TransactionAmount ?? 0}`,
          Hunter: hunterName,
          Status: 'Payment confirmed, held in 24h escrow',
          ViewWindow: '24 hours to view the house',
          Date: new Date().toLocaleString(),
        })
      }
      if (listerEmail) {
        await notifyUser(listerEmail, 'New Booking Payment Received', 'New Booking', {
          Listing: booking.listing_id,
          Amount: `KES ${TransactionAmount ?? 0}`,
          Hunter: hunterName,
          Lister: listerName,
          Status: 'Payment in 24h escrow — contact hunter to arrange visit',
          Date: new Date().toLocaleString(),
        })
      }
      await notifyAdmins('Payment Confirmed — Booking Created', 'Booking Created', {
        Listing: booking.listing_id,
        Amount: `KES ${TransactionAmount ?? 0}`,
        Hunter: `${hunterName} (${hunterEmail || 'N/A'})`,
        Lister: `${listerName} (${listerEmail || 'N/A'})`,
        Status: 'Payment confirmed, held in escrow for 24h',
        PlatformShare: `KES ${Math.round((TransactionAmount ?? 0) * 0.5).toLocaleString()} (50%)`,
        ListerShare: `KES ${Math.round((TransactionAmount ?? 0) * 0.5).toLocaleString()} (50%)`,
        Date: new Date().toLocaleString(),
      })
    } else {
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
        body: `Payment of KES ${TransactionAmount} failed. Please try again.`,
        link: '/my-bookings?tab=payments',
      })
    }

    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch (err) {
    console.error('PayWave webhook error:', err)
    return addSecurityHeaders(NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 }))
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
