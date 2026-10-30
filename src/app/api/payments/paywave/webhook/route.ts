import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseWebhookPayload } from '@/lib/paywave'
import { confirmHouseBookingPayment, PaymentError, type HouseBookingRow } from '@/lib/payments'
import { addSecurityHeaders } from '@/lib/security'

type AnyPayload = Record<string, unknown>

function pickString(source: AnyPayload, keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function pickNumber(source: AnyPayload, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return null
}

function unwrap(rawBody: string): { payload: AnyPayload; daraja: boolean } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const obj = parsed as AnyPayload

  // Daraja-style callbacks still arrive on the old URL.
  const stk = (obj.Body as AnyPayload | undefined)?.stkCallback
  if (stk && typeof stk === 'object') {
    const callback = stk as AnyPayload
    const metadata = (callback.CallbackMetadata as AnyPayload | undefined)?.Item
    const items = Array.isArray(metadata) ? (metadata as Array<{ Name?: string; Key?: string; Value?: unknown }>) : []
    const item = (name: string) =>
      items.find((entry) => entry.Name === name || entry.Key === name)?.Value

    return {
      daraja: true,
      payload: {
        ResponseCode: callback.ResultCode,
        ResponseDescription: callback.ResultDesc,
        MerchantRequestID: callback.MerchantRequestID,
        CheckoutRequestID: callback.CheckoutRequestID,
        TransactionID: callback.OriginatorConversationID,
        TransactionAmount: item('Amount'),
        TransactionReceipt: item('MpesaReceiptNumber'),
        TransactionDate: item('TransactionDate'),
        Msisdn: item('PhoneNumber'),
      },
    }
  }

  // PayWave flat payload.
  const validated = parseWebhookPayload(rawBody)
  if (validated) return { daraja: false, payload: validated as unknown as AnyPayload }

  // Be lenient with field naming differences from the provider.
  const responseCode = pickNumber(obj, ['ResponseCode', 'responseCode', 'resultCode', 'ResultCode'])
  const checkout = pickString(obj, ['CheckoutRequestID', 'checkoutRequestId', 'checkout_request_id'])
  const reference = pickString(obj, ['TransactionReference', 'transactionReference', 'reference', 'account_number'])
  if (responseCode === null || (!checkout && !reference)) return null

  return { daraja: false, payload: obj }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const parsed = unwrap(rawBody)

    if (!parsed) {
      console.error('PayWave webhook: unrecognised payload')
      return addSecurityHeaders(NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 }))
    }

    const payload = parsed.payload
    const admin = createAdminClient()

    const responseCode = pickNumber(payload, ['ResponseCode', 'responseCode', 'ResultCode', 'resultCode'])
    const description = pickString(payload, ['ResponseDescription', 'responseDescription', 'ResultDesc', 'resultDesc'])
    const merchantRequestId = pickString(payload, ['MerchantRequestID', 'merchantRequestId'])
    const checkoutRequestId = pickString(payload, ['CheckoutRequestID', 'checkoutRequestId', 'checkout_request_id'])
    const transactionId = pickString(payload, ['TransactionID', 'transactionId'])
    const amount = pickNumber(payload, ['TransactionAmount', 'transactionAmount', 'amount'])
    const receipt = pickString(payload, ['TransactionReceipt', 'transactionReceipt', 'mpesa_receipt', 'MpesaReceiptNumber'])
    const reference = pickString(payload, ['TransactionReference', 'transactionReference', 'reference'])
    const msisdn = pickString(payload, ['Msisdn', 'msisdn', 'phone'])

    const success = responseCode === 0 || responseCode === 200

    const eventKey = checkoutRequestId || transactionId || reference
    if (!eventKey) {
      return addSecurityHeaders(NextResponse.json({ error: 'Missing transaction identifiers' }, { status: 400 }))
    }

    // Idempotency: the same callback may be delivered several times.
    const { data: existingEvent } = await admin
      .from('paywave_webhook_events')
      .select('id')
      .eq('checkout_request_id', eventKey)
      .maybeSingle()

    if (existingEvent) {
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Already processed' }))
    }

    const recordEvent = async (event: string) => {
      let storedPayload: unknown = rawBody
      try {
        // Store as a real jsonb object so future lookups can query fields.
        storedPayload = JSON.parse(rawBody)
      } catch {
        // keep the raw body
      }
      await admin.from('paywave_webhook_events').insert({
        checkout_request_id: eventKey,
        event,
        amount: amount !== null ? String(amount) : null,
        received_at: new Date().toISOString(),
        payload: storedPayload,
      })
    }

    // Find the booking. New callbacks carry the booking id as the reference;
    // older ones only carry the PayWave checkout id stored on the transaction.
    let booking: HouseBookingRow | null = null

    if (reference) {
      const { data } = await admin.from('house_bookings').select('*').eq('id', reference).maybeSingle()
      if (data) booking = data as HouseBookingRow
    }

    if (!booking && checkoutRequestId) {
      const { data: tx } = await admin
        .from('transactions')
        .select('raw_callback')
        .eq('checkout_request_id', checkoutRequestId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const houseBookingId =
        tx?.raw_callback && typeof tx.raw_callback === 'object'
          ? (tx.raw_callback as Record<string, unknown>).house_booking_id
          : null
      if (typeof houseBookingId === 'string') {
        const { data } = await admin.from('house_bookings').select('*').eq('id', houseBookingId).maybeSingle()
        if (data) booking = data as HouseBookingRow
      }
    }

    if (!booking) {
      console.error('PayWave webhook: booking not found', { reference, checkoutRequestId })
      // Acknowledge so PayWave does not retry forever; admin can reconcile.
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'No matching booking' }))
    }

    if (!success) {
      if (booking.status === 'pending') {
        await admin.from('house_bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      }
      const { error: failTxError } = await admin
        .from('transactions')
        .update({
          status: 'failed',
          result_code: responseCode,
          result_desc: description || 'Payment failed',
          mpesa_message: description || 'Payment failed',
        })
        .filter('raw_callback->>house_booking_id', 'eq', booking.id)
      if (failTxError) console.error('Failed to mark webhook transaction failed:', failTxError)
      await recordEvent('stkpush.failed')
      return addSecurityHeaders(NextResponse.json({ success: true, message: 'Recorded failed payment' }))
    }

    if (amount === null) {
      console.error('PayWave webhook: successful callback without amount', { eventKey })
      return addSecurityHeaders(NextResponse.json({ error: 'Missing amount' }, { status: 400 }))
    }

    if (Math.round(amount) !== Math.round(Number(booking.listing_price))) {
      console.error('PayWave webhook amount mismatch', {
        booking: booking.id,
        expected: booking.listing_price,
        received: amount,
      })
      return addSecurityHeaders(
        NextResponse.json({ error: 'Amount mismatch — payment not applied' }, { status: 400 })
      )
    }

    if (!receipt) {
      console.error('PayWave webhook: successful callback without receipt', { eventKey })
      return addSecurityHeaders(NextResponse.json({ error: 'Missing receipt number' }, { status: 400 }))
    }

    await confirmHouseBookingPayment(admin, {
      bookingId: booking.id,
      amount,
      receiptNumber: receipt,
      transactionRequestId: transactionId || checkoutRequestId || null,
      phone: msisdn || booking.phone,
      source: parsed.daraja ? 'webhook' : 'paywave',
      raw: {
        merchant_request_id: merchantRequestId || null,
        checkout_request_id: checkoutRequestId || null,
        paywave_transaction_id: transactionId || null,
        webhook_response_code: responseCode,
        webhook_description: description,
      },
    })

    await recordEvent('stkpush.success')

    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch (err) {
    if (err instanceof PaymentError) {
      console.error('PayWave webhook rejected:', err.code, err.message)
      return addSecurityHeaders(NextResponse.json({ error: err.message }, { status: err.status }))
    }
    console.error('PayWave webhook error:', err)
    return addSecurityHeaders(NextResponse.json({ error: 'Server error' }, { status: 500 }))
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
