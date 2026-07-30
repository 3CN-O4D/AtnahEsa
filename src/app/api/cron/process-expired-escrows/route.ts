import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { data: expired } = await supabase
      .from('escrow_holds')
      .select('*, booking:bookings(id, release_status)')
      .eq('status', 'held')
      .lt('held_until', now)

    if (!expired || expired.length === 0) {
      return NextResponse.json({ processed: 0 })
    }

    let processed = 0
    for (const escrow of expired) {
      if (escrow.booking?.release_status === 'released') continue

      await supabase.from('escrow_holds').update({
        status: 'released',
        released_at: now,
      }).eq('id', escrow.id)

      await supabase.from('bookings').update({
        release_status: 'released',
      }).eq('id', escrow.booking_id)

      await supabase.from('transactions').insert({
        booking_id: escrow.booking_id,
        user_id: escrow.user_id,
        phone: '',
        amount: escrow.amount,
        mpesa_receipt: '',
        mpesa_message: 'Auto-released after 24h hold expiry (hunter took no action)',
        checkout_request_id: '',
        status: 'success',
      })

      processed++
    }

    if (processed > 0) {
      notifyAdmins(
        'Auto-Release Completed',
        `${processed} escrow(s) auto-released after hold expiry`,
        { Count: String(processed) }
      )
    }

    return NextResponse.json({ processed })
  } catch (err) {
    console.error('Auto-release error:', err)
    return NextResponse.json({ error: 'Failed to process expired escrows' }, { status: 500 })
  }
}
