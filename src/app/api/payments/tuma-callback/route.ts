import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import type { TumaCallback } from '@/lib/tuma'

/**
 * Tuma (I&M Bank) payment callback.
 * Tuma POSTs flat JSON here when an STK push completes.
 * We resolve the pending transaction by merchant/checkout request id,
 * track the Tuma receipt, and notify admins.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TumaCallback

    if (!body || !body.status) {
      return NextResponse.json({ success: false, message: 'Invalid callback' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const merchantRequestId = body.merchant_request_id || ''
    const checkoutRequestId = body.checkout_request_id || ''
    const receipt = body.mpesa_receipt_number || ''
    const resultCode = body.result_code
    const success = body.status === 'completed' && (resultCode === 0 || resultCode === undefined)

    if (!merchantRequestId && !checkoutRequestId) {
      return NextResponse.json({ success: false, message: 'Missing request id' }, { status: 400 })
    }

    // Locate the transaction by whichever id we have.
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
      return NextResponse.json({ success: true, message: 'Already processed' })
    }

    if (!existing) {
      // Record orphan callbacks for auditing even if no local transaction exists.
      notifyAdmins(
        'Tuma Callback (Unmatched)',
        'No Local Transaction Found',
        {
          'Merchant Request ID': merchantRequestId || 'N/A',
          'Checkout ID': checkoutRequestId || 'N/A',
          Status: body.status,
          Receipt: receipt || 'N/A',
        }
      )
      return NextResponse.json({ success: true, message: 'No matching transaction' })
    }

    const txId = existing.id
    await supabase.from('transactions').update({
      mpesa_receipt: receipt,
      merchant_request_id: merchantRequestId,
      result_code: resultCode,
      result_desc: body.result_desc || '',
      raw_callback: body,
      status: success ? 'success' : 'failed',
    }).eq('id', txId)

    if (success) {
      // Fix up the linked house_booking (public booking flow).
      const legacyBookingId = (existing.raw_callback as { house_booking_id?: string } | null)?.house_booking_id
      if (legacyBookingId) {
        await supabase
          .from('house_bookings')
          .update({ status: 'confirmed', mpesa_message: receipt || 'paid via Tuma' })
          .eq('id', legacyBookingId)
      } else {
        await supabase
          .from('house_bookings')
          .update({ status: 'confirmed', mpesa_message: receipt || 'paid via Tuma' })
          .eq('listing_id', existing.listing_id || '')
          .eq('phone', existing.phone || '')
      }

      // Confirm the linked authenticated booking if present (embeds in transactions.booking_id).
      const bookingId = existing.booking_id as string | undefined
      if (bookingId) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, listing_id, user_id, status, escrow_hold_id')
          .eq('id', bookingId)
          .single()

        if (booking && booking.status === 'pending') {
          await supabase.from('bookings').update({
            status: 'confirmed',
            mpesa_receipt: receipt,
            mpesa_metadata: body,
          }).eq('id', booking.id)

          await supabase.from('listings').update({ status: 'booked' }).eq('id', booking.listing_id)
        }
      }

      notifyAdmins(
        'Payment Successful',
        'Tuma Payment Received',
        {
          Phone: existing.phone || 'N/A',
          Amount: body.amount ? `KES ${body.amount}` : 'N/A',
          Receipt: receipt || 'N/A',
          'Merchant Request ID': merchantRequestId || 'N/A',
          'Checkout ID': checkoutRequestId || 'N/A',
          Timestamp: body.timestamp || 'N/A',
        }
      )
    } else {
      notifyAdmins(
        'Payment Failed',
        'Tuma Payment Failed',
        {
          'Merchant Request ID': merchantRequestId || 'N/A',
          'Checkout ID': checkoutRequestId || 'N/A',
          'Result Code': resultCode !== undefined ? String(resultCode) : 'N/A',
          Description: body.result_desc || body.failure_reason || 'N/A',
          Timestamp: body.timestamp || 'N/A',
        }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    // Tuma expects a 2xx; never throw so callbacks aren't retried forever.
    return NextResponse.json({ success: true })
  }
}

export async function GET() {
  return NextResponse.json({ success: true })
}