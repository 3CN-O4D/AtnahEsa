import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import { releaseToLister } from '@/lib/escrow'

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      // Use releaseToLister to enforce audit trail (H6)
      try {
        await releaseToLister({
          escrowId: escrow.id,
          action: 'auto_release',
          actorId: 'system',
          reason: '24-hour hold expiry - auto-released to lister',
        })
        processed++
      } catch (err) {
        console.error(`Auto-release failed for escrow ${escrow.id}:`, err)
      }
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
