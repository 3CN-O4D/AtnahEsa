import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveHouseBookingPayout } from '@/lib/payments'
import { parseBookingFeedback } from '@/lib/booking-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Closes the escrow window.
 *
 * If a hunter neither confirms nor reports a problem before `held_until`, the
 * viewing is treated as successful. The house is marked taken, the lister's
 * payout is approved and admins are told to send the B2C. The money stays held
 * until Treasury records the real M-Pesa receipt, and the hunter can still
 * report a problem while it is held.
 */
export async function GET(req: Request) {
  try {
    if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('house_bookings')
      .select('*')
      .eq('status', 'confirmed')
      .eq('release_status', 'held')
      .lte('held_until', now)
      .order('held_until', { ascending: true })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const due = (data ?? []).filter((row) => {
      const feedback = parseBookingFeedback(row.displeased_reason)
      const legacyFeedback = !!row.confirmed_at && row.rating != null
      return !feedback && !legacyFeedback
    })

    const results: Array<{ id: string; ok: boolean; error?: string; payout_amount?: number }> = []
    for (const booking of due) {
      try {
        const approved = await approveHouseBookingPayout(admin, {
          bookingId: booking.id,
          reason: '24-hour viewing window ended with no report from the hunter',
        })
        results.push({ id: booking.id, ok: true, payout_amount: approved.payoutAmount })
      } catch (err) {
        results.push({
          id: booking.id,
          ok: false,
          error: err instanceof Error ? err.message : 'Could not auto-release',
        })
      }
    }

    return NextResponse.json({
      success: true,
      checked: data?.length ?? 0,
      released: results.filter((item) => item.ok).length,
      results,
    })
  } catch (error) {
    console.error('[cron/auto-release-houses] failed:', error)
    return NextResponse.json({ error: 'Auto-release failed' }, { status: 500 })
  }
}
