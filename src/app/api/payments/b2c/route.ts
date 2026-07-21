import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { b2cPayment } from '@/lib/daraja'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { phone, amount, booking_id, escrow_id, remarks } = await req.json()

    if (!phone || !amount) {
      return NextResponse.json({ error: 'Missing phone or amount' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
    }

    const hasSecurityCredential = process.env.DARAJA_SECURITY_CREDENTIAL
    if (!hasSecurityCredential) {
      return NextResponse.json({ error: 'Daraja B2C not configured (missing SecurityCredential)' }, { status: 500 })
    }

    const adminSupabase = createAdminClient()

    const result = await b2cPayment(phone, amount, remarks || 'Refund', 'Refund')

    const convId = result.OriginatorConversationID || result.ConversationID || ''
    const responseCode = result.ResponseCode
    const responseDesc = result.ResponseDescription || ''

    const { data: tx } = await adminSupabase.from('transactions').insert({
      booking_id: booking_id || null,
      user_id: null,
      phone,
      amount: -amount,
      mpesa_receipt: '',
      mpesa_message: `B2C refund: ${remarks || 'Refund'} - Response: ${responseDesc}`,
      checkout_request_id: '',
      originator_conversation_id: convId,
      status: responseCode === '0' ? 'pending' : 'failed',
      raw_callback: result,
    }).select().single()

    if (escrow_id && responseCode === '0') {
      await adminSupabase.from('escrow_holds').update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
      }).eq('id', escrow_id)
    }

    notifyAdmins(
      responseCode === '0' ? 'B2C Refund Initiated' : 'B2C Refund Failed',
      'Money transfer to customer',
      { Phone: phone, Amount: `KES ${amount}`, 'Conversation ID': convId, Response: responseDesc }
    )

    return NextResponse.json({
      success: responseCode === '0',
      transaction_id: tx?.id || null,
      conversation_id: convId,
      response_code: responseCode,
      response_desc: responseDesc,
    })
  } catch (err) {
    console.error('B2C error:', err)
    return NextResponse.json({ error: 'Failed to process refund' }, { status: 500 })
  }
}