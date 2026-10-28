import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { releaseToLister, refundHunter } from '@/lib/escrow'
import { createNotification } from '@/lib/notifications'
import { addSecurityHeaders } from '@/lib/security'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, reason, escrow_id } = await req.json()
  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.user_id !== user.id) return NextResponse.json({ error: 'Not your booking' }, { status: 403 })
  if (booking.status !== 'confirmed' || booking.release_status !== 'held') {
    return NextResponse.json({ error: 'Booking not in releasable state' }, { status: 400 })
  }

  try {
    switch (action) {
      case 'confirm': {
        await releaseToLister({
          escrowId: reason,
          action: 'hunter_confirm',
          actorId: user.id,
          reason: 'Hunter confirmed satisfaction',
        })
        await supabase.from('house_bookings').update({ release_status: 'released' }).eq('id', id)
        return NextResponse.json({ success: true, message: 'Funds released to lister' })
      }

      case 'displeased': {
        if (!reason?.trim()) return NextResponse.json({ error: 'Reason required' }, { status: 400 })
        await refundHunter({
          escrowId: reason,
          reason: 'viewed_changed_mind',
          actorId: user.id,
          customReason: reason,
        })
        await supabase.from('house_bookings').update({ release_status: 'refunded' }).eq('id', id)
        return NextResponse.json({ success: true, message: '85% refund initiated' })
      }

      case 'fake_no_show': {
        await refundHunter({
          escrowId: reason,
          reason: 'fake_listing',
          actorId: user.id,
          customReason: reason,
        })
        await supabase.from('house_bookings').update({ release_status: 'refunded' }).eq('id', id)
        return NextResponse.json({ success: true, message: '100% refund initiated' })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
