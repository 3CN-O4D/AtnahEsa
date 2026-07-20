import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const callbackData = body.Body?.stkCallback

    if (!callbackData) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback' })
    }

    const checkoutRequestId = callbackData.CheckoutRequestID
    if (!checkoutRequestId) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing CheckoutRequestID' })
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
      .select('id, booking_id, status')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle()

    if (!tx) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Transaction not found' })
    }

    if (tx.status === 'success') {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })
    }

    await supabase.from('transactions').update({
      mpesa_receipt: receipt,
      result_code: ResultCode,
      result_desc: ResultDesc,
      raw_callback: callbackData,
      status: ResultCode === 0 ? 'success' : 'failed',
    }).eq('id', tx.id)

    if (ResultCode === 0) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, listing_id, status')
        .eq('id', tx.booking_id)
        .single()

      if (booking && booking.status === 'pending') {
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
        { Phone: String(phone), Amount: `KES ${amount}`, Receipt: receipt, 'Checkout ID': checkoutRequestId }
      )
    } else {
      notifyAdmins(
        'Payment Failed',
        'M-Pesa Payment Failed',
        { 'Checkout ID': checkoutRequestId, 'Result Code': String(ResultCode), Description: ResultDesc }
      )
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}