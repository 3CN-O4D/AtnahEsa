import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transactionStatusQuery } from '@/lib/daraja'
import { notifyAdmins } from '@/lib/notify'

const TILL_NUMBER = process.env.DARAJA_TILL_NUMBER || ''

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { listing_id, phone, mpesa_message } = await req.json()

    if (!listing_id || !phone || !mpesa_message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const receiptMatch = mpesa_message.match(/([A-Z0-9]{10,})/)
    const amountMatch = mpesa_message.match(/(?:KSh|KES)\s*([\d,]+)/i) || mpesa_message.match(/([\d,]+)\s*(?:KSh|KES)/i)
    const tillMatch = mpesa_message.includes(TILL_NUMBER)

    const receipt = receiptMatch?.[1] || ''

    if (!receipt) {
      return NextResponse.json({ error: 'Could not find transaction code in message' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    const { data: existing } = await adminSupabase
      .from('transactions')
      .select('id')
      .eq('mpesa_receipt', receipt)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This transaction code has already been used' }, { status: 400 })
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('id, title, price, status')
      .eq('id', listing_id)
      .single()

    if (!listing || listing.status !== 'published') {
      return NextResponse.json({ error: 'Listing not available' }, { status: 400 })
    }

    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('listing_id', listing_id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'verifying', 'confirmed'])
      .maybeSingle()

    if (existingBooking) {
      return NextResponse.json({ error: 'You already have a pending booking for this listing' }, { status: 400 })
    }

    const paidAmount = parseInt(amountMatch?.[1]?.replace(/,/g, '') || '') || listing.price

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        listing_id: listing.id,
        user_id: user.id,
        amount: paidAmount,
        phone,
        status: 'verifying',
        mpesa_receipt: receipt,
        mpesa_metadata: { mpesa_message, till_found: tillMatch },
      })
      .select()
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        booking_id: booking.id,
        listing_id: listing.id,
        user_id: user.id,
        phone,
        amount: paidAmount,
        mpesa_receipt: receipt,
        mpesa_message,
        status: 'verifying',
      })
      .select()
      .single()

    if (txError) {
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    let darajaResult: Record<string, unknown> = {}
    try {
      darajaResult = await transactionStatusQuery(receipt)

      if (darajaResult.OriginatorConversationID) {
        await supabase.from('transactions').update({
          originator_conversation_id: darajaResult.OriginatorConversationID,
        }).eq('id', tx.id)
      }
    } catch (err) {
      console.error('Transaction status query failed:', err)
    }

    notifyAdmins(
      'Manual Payment Submitted for Verification',
      'M-Pesa Payment Pending Daraja Check',
      { User: user.email || 'N/A', Phone: phone, Listing: listing.title || 'N/A', Amount: `KES ${paidAmount}`, Receipt: receipt }
    )

    return NextResponse.json({
      success: true,
      booking_id: booking.id,
      transaction_id: tx.id,
      receipt,
      daraja_initiated: !!darajaResult.ResponseCode,
    })
  } catch (err) {
    console.error('Manual verify error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}