import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const callbackData = body.Body?.stkCallback

    if (!callbackData) {
      return NextResponse.json({ error: 'Invalid callback' }, { status: 400 })
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callbackData

    const supabase = createAdminClient()

    const receipt = CallbackMetadata?.Item?.find(
      (i: { Key: string }) => i.Key === 'MpesaReceiptNumber'
    )?.Value || ''

    const phone = CallbackMetadata?.Item?.find(
      (i: { Key: string }) => i.Key === 'PhoneNumber'
    )?.Value || ''

    const amount = CallbackMetadata?.Item?.find(
      (i: { Key: string }) => i.Key === 'Amount'
    )?.Value || 0

    const { data: tx } = await supabase
      .from('transactions')
      .select('id, booking_id')
      .eq('checkout_request_id', CheckoutRequestID)
      .single()

    if (tx) {
      await supabase.from('transactions').update({
        mpesa_receipt: receipt,
        result_code: ResultCode,
        result_desc: ResultDesc,
        raw_callback: callbackData,
        status: ResultCode === 0 ? 'success' : 'failed',
      }).eq('id', tx.id)
    }

    if (ResultCode === 0 && tx) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, listing_id')
        .eq('id', tx.booking_id)
        .single()

      if (booking) {
        await supabase.from('bookings').update({
          status: 'confirmed',
          mpesa_receipt: receipt,
          mpesa_metadata: callbackData,
        }).eq('id', booking.id)

        await supabase.from('listings').update({ status: 'booked' }).eq('id', booking.listing_id)
      }

      notifyAdmins(
        'Payment Successful',
        'M-Pesa Payment Received',
        { Phone: String(phone), Amount: `KES ${amount}`, Receipt: receipt, 'Checkout ID': CheckoutRequestID }
      )
    } else {
      notifyAdmins(
        'Payment Failed',
        'M-Pesa Payment Failed',
        { 'Checkout ID': CheckoutRequestID, 'Result Code': String(ResultCode), Description: ResultDesc }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Callback error:', err)
    return NextResponse.json({ success: true })
  }
}