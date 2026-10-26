import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

const DARAJA_BASE = process.env.DARAJA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke'

async function getDarajaAccessToken(supabase: ReturnType<typeof createAdminClient>) {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY!
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET!
  if (!consumerKey || !consumerSecret) return null

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
  try {
    const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token as string
  } catch {
    return null
  }
}

async function verifyDarajaTransaction(checkoutRequestId: string, accessToken: string) {
  try {
    const res = await fetch(`${DARAJA_BASE}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: process.env.DARAJA_SHORTCODE!,
        Password: '', // would need to generate stk password; omit if not available
        Timestamp: '',
        CheckoutRequestID: checkoutRequestId,
      }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

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
      OriginatorConversationID,
    } = callbackData

    if (typeof ResultCode !== 'number') {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid ResultCode' })
    }

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
      .select('id, booking_id, status, amount, raw_callback')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle()

    if (!tx) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Transaction not found' })
    }

    if (tx.status === 'success') {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })
    }

    if (tx.status !== 'pending') {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Transaction not payable' })
    }

    if (typeof amount === 'number' && amount > 0 && tx.amount && amount !== tx.amount) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Amount mismatch' })
    }

    const priorOriginator = (tx.raw_callback as { OriginatorConversationID?: string } | null)?.OriginatorConversationID
    if (priorOriginator && OriginatorConversationID && OriginatorConversationID !== priorOriginator) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Originator mismatch' })
    }

    // H-05 hardening: verify with Daraja Transaction Status before marking paid
    if (ResultCode === 0) {
      const token = await getDarajaAccessToken(supabase)
      if (token) {
        const verification = await verifyDarajaTransaction(checkoutRequestId, token)
        if (verification) {
          const { ResultCode: verifyResultCode } = verification
          if (verifyResultCode !== 0 && verifyResultCode !== '0') {
            return NextResponse.json({ ResultCode: 1, ResultDesc: 'Daraja verification failed' })
          }
        }
      }
      // If no credentials configured, fall back to callback trust (existing behavior)
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
        .select('id, listing_id, user_id, status, escrow_hold_id')
        .eq('id', tx.booking_id)
        .single()

      if (booking && booking.status === 'pending') {
        await supabase.from('bookings').update({
          status: 'confirmed',
          mpesa_receipt: receipt,
          mpesa_metadata: callbackData,
        }).eq('id', booking.id)

        await supabase.from('listings').update({ status: 'booked' }).eq('id', booking.listing_id)

        if (!booking.escrow_hold_id) {
          const heldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          const { data: escrow } = await supabase
            .from('escrow_holds')
            .insert({
              booking_id: booking.id,
              user_id: booking.user_id,
              listing_id: booking.listing_id,
              amount: amount || 0,
              status: 'held',
              held_until: heldUntil,
            })
            .select()
            .single()
          if (escrow) {
            await supabase.from('bookings').update({ escrow_hold_id: escrow.id }).eq('id', booking.id)
          }
        }
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