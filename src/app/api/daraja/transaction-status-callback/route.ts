import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = body.Result

    if (!result) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback' })
    }

    const {
      TransactionID,
      ResultCode,
      ResultDesc,
      ResultParameters,
    } = result

    const receipt = TransactionID || ''

    if (!receipt) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing TransactionID' })
    }

    const supabase = createAdminClient()

    const { data: tx } = await supabase
      .from('transactions')
      .select('id, booking_id, user_id, amount, listing_id, status')
      .eq('mpesa_receipt', receipt)
      .maybeSingle()

    if (!tx) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Transaction not found' })
    }

    if (tx.status !== 'verifying') {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Already processed' })
    }

    if (ResultCode === 0) {
      let verifiedAmount = 0
      let verifiedReceipt = ''
      let receiverName = ''

      if (ResultParameters?.ResultParameter) {
        const params = ResultParameters.ResultParameter
        const find = (key: string) => params.find((p: { Key: string }) => p.Key === key)?.Value
        verifiedAmount = parseInt(find('TransactionAmount')) || 0
        verifiedReceipt = find('ReceiptNo') || receipt
        receiverName = find('ReceiverPartyPublicName') || ''
      }

      const amountOk = verifiedAmount <= 0 || verifiedAmount === tx.amount

      if (amountOk) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('id, listing_id, user_id, status, mpesa_metadata')
          .eq('id', tx.booking_id)
          .single()

        if (booking && booking.status === 'verifying') {
          const existingMeta = (booking.mpesa_metadata || {}) as Record<string, unknown>
          const heldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

          const { data: escrow } = await supabase
            .from('escrow_holds')
            .insert({
              booking_id: booking.id,
              user_id: booking.user_id,
              listing_id: booking.listing_id,
              amount: tx.amount,
              status: 'held',
              held_until: heldUntil,
            })
            .select()
            .single()

          await supabase.from('bookings').update({
            status: 'confirmed',
            mpesa_receipt: verifiedReceipt,
            mpesa_metadata: { ...existingMeta, verified_by_daraja: true, receiver_name: receiverName },
            escrow_hold_id: escrow?.id || null,
          }).eq('id', booking.id)

          await supabase.from('listings').update({ status: 'booked' }).eq('id', booking.listing_id)
        }

        await supabase.from('transactions').update({
          status: 'success',
          result_code: ResultCode,
          result_desc: 'Verified by Daraja Transaction Status API',
          raw_callback: result,
        }).eq('id', tx.id)

        notifyAdmins(
          'Manual Payment Verified by Daraja',
          'M-Pesa Transaction Confirmed',
          { Receipt: verifiedReceipt, Amount: `KES ${tx.amount}`, 'Receiver': receiverName }
        )


      } else {
        await supabase.from('transactions').update({
          status: 'failed',
          result_code: ResultCode,
          result_desc: `Amount mismatch: Daraja reported ${verifiedAmount}, expected ${tx.amount}`,
          raw_callback: result,
        }).eq('id', tx.id)

        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', tx.booking_id)

        notifyAdmins(
          'Manual Payment Verification Failed',
          'Amount mismatch detected',
          { Receipt: receipt, 'Daraja Amount': String(verifiedAmount), 'Expected': String(tx.amount) }
        )
      }
    } else {
      await supabase.from('transactions').update({
        status: 'failed',
        result_code: ResultCode,
        result_desc: ResultDesc || 'Transaction not found or invalid',
        raw_callback: result,
      }).eq('id', tx.id)

      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', tx.booking_id)

      notifyAdmins(
        'Manual Payment Verification Failed',
        'Daraja could not confirm the transaction',
        { Receipt: receipt, 'Result Code': String(ResultCode), Description: ResultDesc }
      )
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch (err) {
    console.error('Transaction status callback error:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}