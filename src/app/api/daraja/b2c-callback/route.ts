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
      ConversationID,
      OriginatorConversationID,
    } = result

    const supabase = createAdminClient()

    let receipt = ''
    let amount = 0
    let receiverName = ''

    if (ResultCode === 0 && ResultParameters?.ResultParameter) {
      const params = ResultParameters.ResultParameter
      const find = (key: string) => params.find((p: { Key: string }) => p.Key === key)?.Value
      receipt = find('TransactionReceipt') || TransactionID || ''
      amount = parseInt(find('TransactionAmount')) || 0
      receiverName = find('ReceiverPartyPublicName') || ''
    }

    const convId = ConversationID || OriginatorConversationID || ''

    const { data: tx } = await supabase
      .from('transactions')
      .select('id, booking_id, mpesa_receipt, status')
      .eq('originator_conversation_id', convId)
      .maybeSingle()

    if (tx) {
      await supabase.from('transactions').update({
        status: ResultCode === 0 ? 'success' : 'failed',
        mpesa_receipt: receipt || tx.mpesa_receipt,
        result_code: ResultCode,
        result_desc: ResultDesc || '',
        raw_callback: result,
      }).eq('id', tx.id)
    }

    if (ResultCode === 0) {
      notifyAdmins(
        'B2C Refund Successful',
        'Money sent to customer',
        { Receipt: receipt, Amount: `KES ${amount}`, Receiver: receiverName, 'Conversation ID': convId }
      )
    } else {
      notifyAdmins(
        'B2C Refund Failed',
        'Failed to send money to customer',
        { 'Conversation ID': convId, 'Result Code': String(ResultCode), Description: ResultDesc }
      )
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch (err) {
    console.error('B2C callback error:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}