import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import { createNotification } from '@/lib/notifications'
import { notifyPhoneWhatsApp } from '@/lib/whatsapp/outbox'
import { confirmHouseBookingPayment, PaymentError } from '@/lib/payments'
import type { TumaCallback } from '@/lib/tuma'
import { addSecurityHeaders } from '@/lib/security'

/**
 * Tuma (I&M Bank) payment callback.
 *
 * All successful payments now go through the same escrow engine as PayWave so
 * `paid_at`, the PDF receipt, the 24h hold, the listing status and admin alerts
 * are identical regardless of provider. Failures cancel only truly unpaid
 * bookings and tell the hunter rather than leaving a dead-end pending row.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TumaCallback

    if (!body || !body.status) {
      const resp = NextResponse.json({ success: false, message: 'Invalid callback' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    const supabase = createAdminClient()

    const merchantRequestId = body.merchant_request_id || ''
    const checkoutRequestId = body.checkout_request_id || ''
    const receipt = body.mpesa_receipt_number || ''
    const resultCode = body.result_code
    const success = body.status === 'completed' && (resultCode === 0 || resultCode === undefined)

    if (!merchantRequestId && !checkoutRequestId) {
      const resp = NextResponse.json({ success: false, message: 'Missing request id' }, { status: 400 })
      return addSecurityHeaders(resp)
    }

    let query = supabase
      .from('transactions')
      .select('id, booking_id, status, phone, amount, merchant_request_id, listing_id, raw_callback')
    if (merchantRequestId && checkoutRequestId) {
      query = query.or(`checkout_request_id.eq.${checkoutRequestId},merchant_request_id.eq.${merchantRequestId}`)
    } else if (checkoutRequestId) {
      query = query.eq('checkout_request_id', checkoutRequestId)
    } else {
      query = query.eq('merchant_request_id', merchantRequestId)
    }

    const { data: existing } = await query.maybeSingle()

    if (existing && existing.status === 'success') {
      const resp = NextResponse.json({ success: true, message: 'Already processed' })
      return addSecurityHeaders(resp)
    }

    if (!existing) {
      notifyAdmins('Tuma Callback (Unmatched)', 'No Local Transaction Found', {
        'Merchant Request ID': merchantRequestId || 'N/A',
        'Checkout ID': checkoutRequestId || 'N/A',
        Status: body.status,
        Receipt: receipt || 'N/A',
      }).catch(() => {})
      const resp = NextResponse.json({ success: true, message: 'No matching transaction' })
      return addSecurityHeaders(resp)
    }

    const raw = (existing.raw_callback as Record<string, unknown> | null) ?? {}
    const linkedBookingId =
      typeof raw.house_booking_id === 'string'
        ? raw.house_booking_id
        : typeof existing.booking_id === 'string'
          ? existing.booking_id
          : ''

    // Resolve modern house bookings by the explicit link first. The old
    // listing+phone fallback is kept only to repair older callbacks.
    let { data: houseBooking } = linkedBookingId
      ? await supabase.from('house_bookings').select('*').eq('id', linkedBookingId).maybeSingle()
      : { data: null }
    if (!houseBooking && existing.listing_id && existing.phone) {
      const { data: fallback } = await supabase
        .from('house_bookings')
        .select('*')
        .eq('listing_id', existing.listing_id)
        .eq('phone', existing.phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      houseBooking = fallback
    }

    const resolvedBookingId = houseBooking?.id || linkedBookingId

    if (success) {
      if (!receipt) {
        notifyAdmins('Tuma Payment Missing Receipt', 'Manual Verification Needed', {
          Phone: existing.phone || 'N/A',
          Amount: `KES ${Number(body.amount ?? existing.amount ?? 0).toLocaleString()}`,
          'Checkout ID': checkoutRequestId || merchantRequestId || 'N/A',
          Instruction: 'Ask the hunter for the full M-Pesa SMS and verify it in Treasury.',
        }).catch(() => {})
        const resp = NextResponse.json({ success: true, message: 'Receipt pending verification' })
        return addSecurityHeaders(resp)
      }

      if (!resolvedBookingId) {
        notifyAdmins('Tuma Payment (Unlinked)', 'No House Booking Found', {
          Phone: existing.phone || 'N/A',
          Amount: `KES ${Number(body.amount ?? existing.amount ?? 0).toLocaleString()}`,
          Receipt: receipt,
          'Checkout ID': checkoutRequestId || merchantRequestId || 'N/A',
          Instruction: 'Link this receipt to a house booking before releasing any funds.',
        }).catch(() => {})
        const resp = NextResponse.json({ success: true, message: 'No linked booking' })
        return addSecurityHeaders(resp)
      }

      // Repair the transaction link so canonical dedupe finds it.
      await supabase
        .from('transactions')
        .update({
          raw_callback: { ...raw, ...(body as unknown as Record<string, unknown>), house_booking_id: resolvedBookingId },
          merchant_request_id: merchantRequestId || existing.merchant_request_id,
          mpesa_receipt: receipt,
        })
        .eq('id', existing.id)

      try {
        const result = await confirmHouseBookingPayment(supabase, {
          bookingId: resolvedBookingId,
          amount: Number(body.amount ?? existing.amount ?? houseBooking?.listing_price ?? 0),
          receiptNumber: receipt,
          paymentMethod: 'tuma',
          transactionRequestId: checkoutRequestId || merchantRequestId || null,
          phone: existing.phone,
          source: 'webhook',
          raw: { provider: 'tuma', ...(body as unknown as Record<string, unknown>) },
        })
        if (result.requiresRefund) {
          console.warn('[tuma-callback] late payment after cancellation routed to refund review', resolvedBookingId)
        }
      } catch (error) {
        const message = error instanceof PaymentError ? error.message : 'Unknown escrow error'
        notifyAdmins('Tuma Confirmation Failed', 'Escrow Not Opened', {
          Booking: resolvedBookingId,
          Receipt: receipt,
          Amount: `KES ${Number(body.amount ?? existing.amount ?? 0).toLocaleString()}`,
          Error: message,
          Action: 'Verify manually in Treasury before telling the hunter the money is held.',
        }).catch(() => {})
      }

      // Legacy public bookings (no authenticated house_bookings row) still get
      // their original bookings/listing update for backwards compatibility.
      if (existing.booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, listing_id, status')
          .eq('id', existing.booking_id)
          .maybeSingle()
        if (booking && booking.status === 'pending') {
          await supabase
            .from('bookings')
            .update({ status: 'confirmed', mpesa_receipt: receipt, mpesa_metadata: body })
            .eq('id', booking.id)
          await supabase
            .from('listings')
            .update({ status: 'booked', taken_at: null, taken_by_name: '' })
            .eq('id', booking.listing_id)
        }
      }
    } else {
      await supabase
        .from('transactions')
        .update({
          mpesa_receipt: receipt,
          result_code: resultCode,
          result_desc: body.result_desc || body.failure_reason || '',
          raw_callback: { ...raw, ...(body as unknown as Record<string, unknown>) },
          status: 'failed',
        })
        .eq('id', existing.id)

      if (houseBooking && houseBooking.status === 'pending' && houseBooking.release_status === 'pending') {
        await supabase.from('house_bookings').update({ status: 'cancelled' }).eq('id', houseBooking.id)
        if (houseBooking.user_id) {
          await createNotification({
            userId: houseBooking.user_id,
            category: 'transaction',
            title: 'Payment not completed',
            body: `The M-Pesa prompt for ${houseBooking.listing_title || 'your house'} did not complete. Your booking was cancelled; you can request a new viewing.`,
            link: '/my-escrow',
            data: { house_booking_id: houseBooking.id },
          })
        }
        await notifyPhoneWhatsApp(
          houseBooking.phone,
          'Payment Not Completed',
          'Your viewing request was cancelled ❌',
          {
            House: houseBooking.listing_title || 'your house',
            Status: 'The M-Pesa prompt did not complete and no viewing fee was charged.',
            'Try Again': 'Open the listing to request a new viewing.',
          }
        )
      }
    }

    const resp = NextResponse.json({ success: true })
    return addSecurityHeaders(resp)
  } catch {
    // Tuma expects a 2xx; never throw so callbacks aren't retried forever.
    const resp = NextResponse.json({ success: true })
    return addSecurityHeaders(resp)
  }
}

export async function GET() {
  const resp = NextResponse.json({ success: true })
  return addSecurityHeaders(resp)
}
