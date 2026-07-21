import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const transactionId = searchParams.get('transaction_id')

    if (!transactionId) {
      return NextResponse.json({ error: 'Missing transaction_id' }, { status: 400 })
    }

    const { data: tx } = await supabase
      .from('transactions')
      .select('id, user_id, status, result_code, result_desc, mpesa_receipt, booking_id')
      .eq('id', transactionId)
      .single()

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    if (tx.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let booking = null
    if (tx.booking_id && tx.status === 'success') {
      const { data: b } = await supabase
        .from('bookings')
        .select('id, status, mpesa_receipt, escrow_hold_id')
        .eq('id', tx.booking_id)
        .single()
      booking = b
    }

    return NextResponse.json({
      status: tx.status,
      result_code: tx.result_code,
      result_desc: tx.result_desc,
      mpesa_receipt: tx.mpesa_receipt,
      booking,
    })
  } catch (err) {
    console.error('Verify status error:', err)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}