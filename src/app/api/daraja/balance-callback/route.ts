import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = body.Result

    if (!result) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid callback' })
    }

    const {
      ResultCode,
      ResultDesc,
      ResultParameters,
      TransactionID,
    } = result

    const supabase = createAdminClient()

    let balanceInfo: Record<string, string> = {}

    if (ResultCode === 0 && ResultParameters?.ResultParameter) {
      const params = ResultParameters.ResultParameter
      for (const p of params) {
        if (p.Key.startsWith('AccountBalance')) {
          const val: string = p.Value || ''
          const parts = val.split('&')
          for (const part of parts) {
            const [key, value] = part.split('=')
            if (key && value) balanceInfo[key.trim()] = value.trim()
          }
        } else if (p.Key === 'CompletedTime') {
          balanceInfo.completed_time = p.Value
        }
      }
    }

    await supabase.from('transactions').insert({
      user_id: null,
      phone: 'SYSTEM',
      amount: 0,
      mpesa_receipt: '',
      mpesa_message: `Account balance query result - Code: ${ResultCode}, Desc: ${ResultDesc || ''}`,
      checkout_request_id: TransactionID || '',
      status: ResultCode === 0 ? 'success' : 'failed',
      result_code: ResultCode,
      result_desc: ResultDesc,
      raw_callback: result,
    })

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  } catch (err) {
    console.error('Balance callback error:', err)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' })
  }
}