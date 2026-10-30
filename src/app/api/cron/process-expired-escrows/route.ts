import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'

/**
 * Legacy escrow holds (the older `bookings` flow).
 *
 * Payouts are never automatic. When a hold expires we only flag it to admins;
 * an admin must send the M-Pesa payout and record the payout SMS in Treasury
 * before anything is marked paid.
 */
export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const now = new Date().toISOString()
    const dedupeSince = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

    const { data: expired, error } = await supabase
      .from('escrow_holds')
      .select('id, amount, listing_id, booking_id, held_until, lister_id')
      .eq('status', 'held')
      .lt('held_until', now)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!expired || expired.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No expired escrows' })
    }

    const { data: recent } = await supabase
      .from('notifications')
      .select('title')
      .eq('title', 'Escrow Expired — Payout Required')
      .gte('created_at', dedupeSince)
      .limit(1)

    if (!recent || recent.length === 0) {
      await notifyAdmins(
        'Escrow Expired — Payout Required',
        `${expired.length} Escrow Hold(s) Expired`,
        {
          Count: String(expired.length),
          Message:
            'No money was moved automatically. Review each hold, send the lister payout by M-Pesa, then record the payout SMS in Treasury.',
          Link: 'https://www.asehanta.com/admin/treasury',
        }
      )
    }

    return NextResponse.json({
      processed: 0,
      expired: expired.length,
      message: 'Flagged to admins. Payouts require an admin SMS record.',
    })
  } catch (err) {
    console.error('Expired escrow reminder error:', err)
    return NextResponse.json({ error: 'Failed to process expired escrows' }, { status: 500 })
  }
}
