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
      return addSecurityHeaders(NextResponse.json({ error: 'Invalid signature' }, { status: 400 }))
    }

    const payload = JSON.parse(rawBody)
    const { event, data } = payload

    const admin = createAdminClient()

    const { data: booking } = await admin
      .from('house_bookings')
      .select('*')
      .eq('id', data.reference)
      .single()

    if (!booking) {
      console.error('Booking not found for reference:', data.reference)
      return addSecurityHeaders(NextResponse.json({ success: true }))
    }

    const { data: escrow } = await admin
      .from('escrow_holds')
      .select('*')
      .eq('booking_id', booking.id)
      .single()

    if (!escrow) {
      console.error('Escrow not found for booking:', booking.id)
      return addSecurityHeaders(NextResponse.json({ success: true }))
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
          userId: booking.uploader_id,
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
    return addSecurityHeaders(NextResponse.json({ success: true }))
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
