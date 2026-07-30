import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.error('Daraja timeout:', JSON.stringify(body))

    const checkoutId = body.Body?.stkCallback?.CheckoutRequestID || body.CheckoutRequestID || ''

    if (checkoutId) {
      const supabase = createAdminClient()
      const { data: tx } = await supabase
        .from('transactions')
        .select('id, booking_id, status')
        .eq('checkout_request_id', checkoutId)
        .maybeSingle()

      if (tx && tx.status === 'pending') {
        await supabase.from('transactions').update({
          status: 'failed',
          result_desc: 'STK push timed out — user did not enter PIN',
        }).eq('id', tx.id)

        if (tx.booking_id) {
          await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', tx.booking_id)
        }
      }
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}