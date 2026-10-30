import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAdmins, notifyUser } from '@/lib/notify'
import { createNotification } from '@/lib/notifications'
import { ESCROW_HOURS } from '@/lib/constants'

const REMINDER_WINDOW_HOURS = 2
const DEDUPE_HOURS = 12

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Escrow closing reminders.
 *
 * The 24-hour view window is advisory: when it closes we never move money or
 * mark the lister paid automatically. Instead we remind the hunter to confirm,
 * and escalate to admins so they can send the payout by M-Pesa and record the
 * payout SMS in Treasury. Money only moves after an admin pastes proof.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const now = Date.now()
    const reminderCutoff = new Date(now + REMINDER_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    const dedupeSince = new Date(now - DEDUPE_HOURS * 60 * 60 * 1000).toISOString()

    const { data: bookings, error } = await admin
      .from('house_bookings')
      .select('id, listing_id, listing_title, name, phone, email, listing_price, user_id, held_until')
      .eq('status', 'confirmed')
      .eq('release_status', 'held')
      .not('held_until', 'is', null)
      .lte('held_until', reminderCutoff)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ success: true, message: 'No escrow reminders due', count: 0 })
    }

    let reminded = 0
    let escalated = 0

    for (const booking of bookings) {
      const expired = booking.held_until ? new Date(booking.held_until).getTime() <= now : false
      const title = booking.listing_title || 'your house'
      const hunterPayout = Math.round(Number(booking.listing_price || 0) * 0.5)

      if (!expired) {
        if (await recentlyNotified(admin, 'Escrow closes soon', booking.id, dedupeSince)) continue

        if (booking.user_id) {
          await createNotification({
            userId: booking.user_id,
            category: 'transaction',
            title: 'Escrow closes soon',
            body: `Your view window for "${title}" closes in under ${REMINDER_WINDOW_HOURS} hours. Confirm you are pleased, or tell us what went wrong, from My Bookings.`,
            link: '/my-bookings?tab=payments',
            data: { house_booking_id: booking.id },
          })
        }

        if (booking.email) {
          await notifyUser(
            booking.email,
            `Escrow closes soon — ${title}`,
            'Your escrow closes soon',
            {
              House: title,
              'Hunting Fee': `KES ${Number(booking.listing_price || 0).toLocaleString()}`,
              'Window Closes': booking.held_until
                ? new Date(booking.held_until).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
                : `${ESCROW_HOURS} hours after payment`,
              'What To Do': 'Open My Bookings → Payments. Confirm if you are pleased, or request a refund if not.',
              Link: 'https://www.asehanta.com/my-bookings?tab=payments',
            }
          )
        }

        reminded++
        continue
      }

      // Window elapsed. Never auto-release: admins must record the payout SMS.
      if (await recentlyNotified(admin, 'Escrow closed', booking.id, dedupeSince)) continue

      if (booking.user_id) {
        await createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Escrow window closed',
          body: `Your view window for "${title}" has closed. Our team will contact you before releasing anything. If you were not pleased, open My Bookings → Payments to request a refund.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id },
        })
      }

      await notifyAdmins(
        'Escrow Closed — Admin Payout Required',
        'Escrow Window Closed',
        {
          House: title,
          Hunter: `${booking.name || 'N/A'} (${booking.phone || 'N/A'})`,
          'Hunting Fee': `KES ${Number(booking.listing_price || 0).toLocaleString()}`,
          'Lister Share (50%)': `KES ${hunterPayout.toLocaleString()}`,
          'Window Closed': booking.held_until
            ? new Date(booking.held_until).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })
            : 'Now',
          'Action Required':
            'Contact the hunter. If they are pleased, send the lister 50% by M-Pesa and record the payout SMS in Treasury → House Payments. Do not release without the SMS.',
          Link: 'https://www.asehanta.com/admin/treasury',
        }
      )

      escalated++
    }

    if (reminded > 0 || escalated > 0) {
      await notifyAdmins(
        'Escrow Reminders Sent',
        'Escrow Reminder Run',
        {
          'Closing Soon': String(reminded),
          'Window Closed (payout pending)': String(escalated),
          Message: 'No money was moved automatically. Record lister payouts in Treasury after sending M-Pesa.',
        }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${reminded} reminder(s), ${escalated} expired escrow(s) escalated`,
      reminded,
      escalated,
      count: reminded + escalated,
    })
  } catch (err) {
    console.error('Escrow reminder cron error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

async function recentlyNotified(
  admin: AdminClient,
  title: string,
  bookingId: string,
  sinceIso: string
): Promise<boolean> {
  const { data } = await admin
    .from('notifications')
    .select('id')
    .eq('title', title)
    .filter('data->>house_booking_id', 'eq', bookingId)
    .gte('created_at', sinceIso)
    .limit(1)

  return Boolean(data && data.length > 0)
}
