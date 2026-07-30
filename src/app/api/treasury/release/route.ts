import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { escrow_id } = await req.json()
    if (!escrow_id) return NextResponse.json({ error: 'escrow_id required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: escrow } = await admin
      .from('escrow_holds')
      .select('id, booking_id, user_id, listing_id, amount, status, held_until')
      .eq('id', escrow_id)
      .single()

    if (!escrow) return NextResponse.json({ error: 'Escrow not found' }, { status: 404 })
    if (escrow.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (escrow.status !== 'held') return NextResponse.json({ error: 'Escrow already processed' }, { status: 400 })

    const { data: booking } = await admin
      .from('bookings')
      .select('id, release_status')
      .eq('id', escrow.booking_id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (booking.release_status === 'released') return NextResponse.json({ error: 'Already released' }, { status: 400 })

    await admin.from('escrow_holds').update({
      status: 'released',
      released_at: new Date().toISOString(),
    }).eq('id', escrow.id)

    await admin.from('bookings').update({
      release_status: 'released',
    }).eq('id', booking.id)

    await admin.from('transactions').insert({
      booking_id: booking.id,
      user_id: escrow.user_id,
      phone: '',
      amount: escrow.amount,
      mpesa_receipt: '',
      mpesa_message: 'Funds released to lister',
      checkout_request_id: '',
      status: 'success',
    })

    fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notify-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: booking.id }),
    }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Funds released to lister' })
  } catch (err) {
    console.error('Release error:', err)
    return NextResponse.json({ error: 'Failed to release funds' }, { status: 500 })
  }
}
