import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins } from '@/lib/notify'
import { createNotification } from '@/lib/notifications'
import { releaseToLister } from '@/lib/escrow'
import { VIEW_WINDOW_HOURS } from '@/lib/constants'

/**
 * Cron job to auto-confirm bookings after 24-hour view window.
 * Runs every hour via pg_cron or Vercel Cron.
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Find bookings where:
    // - status is 'confirmed'
    // - release_status is 'held'
    // - created_at is older than VIEW_WINDOW_HOURS
    // - not yet auto-confirmed
    const cutoffTime = new Date(Date.now() - VIEW_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

    const { data: bookings, error } = await admin
      .from('house_bookings')
      .select('id, listing_id, listing_title, phone, listing_price, user_id, created_at')
      .eq('status', 'confirmed')
      .eq('release_status', 'held')
      .lt('created_at', cutoffTime)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ success: true, message: 'No bookings to auto-confirm', count: 0 })
    }

    const now = new Date().toISOString()
    let processed = 0

    for (const booking of bookings) {
      // Auto-confirm: hunter didn't respond in 24hrs, assume house is taken
      // Use releaseToLister to enforce escrow audit trail (H5)
      const { data: escrow } = await admin
        .from('escrow_holds')
        .select('*')
        .eq('house_booking_id', booking.id)
        .single()

      if (escrow) {
        try {
          await releaseToLister({
            escrowId: escrow.id,
            action: 'auto_release',
            actorId: 'system',
            reason: '24-hour view window elapsed - auto-released to lister',
          })
        } catch (releaseErr) {
          console.error(`Failed to release escrow for booking ${booking.id}:`, releaseErr)
          continue
        }
      }

      const { error } = await admin
        .from('house_bookings')
        .update({
          release_status: 'paid',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      if (error) {
        console.error(`Failed to auto-confirm booking ${booking.id}:`, error)
        continue
      }

      // Notify lister
      const { data: listing } = await admin
        .from('listings')
        .select('uploader_id, title')
        .eq('id', booking.listing_id)
        .maybeSingle()

      if (listing?.uploader_id) {
        await createNotification({
          userId: listing.uploader_id,
          category: 'transaction',
          title: `Auto-confirmed: "${listing.title || 'your house'}"`,
          body: `The 24-hour view window has passed. The hunter is assumed pleased. Your payout (50% = KES ${Math.round((booking.listing_price || 0) * 0.5).toLocaleString()}) will be released.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id },
        })
      }

      // Update listing status to taken
      await admin
        .from('listings')
        .update({ status: 'taken', taken_at: new Date().toISOString(), taken_by_name: booking.phone || 'Hunter' })
        .eq('id', booking.listing_id)

      processed++
    }

    await notifyAdmins(
      'Auto-Confirmations Processed',
      `${processed} Booking(s) Auto-Confirmed`,
      {
        Count: processed.toString(),
        Window: `${VIEW_WINDOW_HOURS} hours`,
        Message: 'These bookings were auto-confirmed after the 24-hour view window elapsed.',
      }
    )

    return NextResponse.json({ success: true, message: `${processed} booking(s) auto-confirmed`, count: processed })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}