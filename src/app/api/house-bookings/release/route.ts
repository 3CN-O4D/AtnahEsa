import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import { createNotification } from '@/lib/notifications'
import { REFUND_PERCENTAGES, VIEW_WINDOW_HOURS, REFUND_PROCESSING_HOURS } from '@/lib/constants'

/**
 * Hunter-facing actions on a paid house booking (public Tuma flow):
 *   - confirm: hunter is pleased, so funds can later be released to the lister
 *   - displeased: hunter is unhappy; 85% refunded, lister gets nothing
 *   - fake_no_show: 100% refund if listing is fake or lister no-show
 * The listing owner (lister) is paid via the admin Treasury manually.
 */
export async function POST(req: Request) {
  try {
    const { booking_id, action, rating, reason } = await req.json()

    if (!booking_id || !action) {
      return NextResponse.json({ error: 'booking_id and action are required' }, { status: 400 })
    }
    if (!['confirm', 'displeased', 'fake_no_show'].includes(action)) {
      return NextResponse.json({ error: 'Action must be confirm, displeased, or fake_no_show' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to manage your booking' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: booking } = await admin
      .from('house_bookings')
      .select('id, status, release_status, listing_id, listing_title, phone, listing_price, user_id, created_at')
      .eq('id', booking_id)
      .single()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.user_id && booking.user_id !== user.id) {
      return NextResponse.json({ error: 'This is not your booking' }, { status: 403 })
    }

    if (booking.status !== 'confirmed' || booking.release_status !== 'held') {
      return NextResponse.json({ error: 'This booking is not awaiting your confirmation' }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (action === 'confirm') {
      const { error } = await admin
        .from('house_bookings')
        .update({ confirmed_at: now, rating: rating ?? 5, displeased_reason: '' })
        .eq('id', booking_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await notifyAdmins(
        'Booking Confirmed',
        'Hunter Pleased — Release Funds',
        {
          House: booking.listing_title || 'N/A',
          'Hunter Phone': booking.phone || 'N/A',
          'Hunting Fee': booking.listing_price ? `KES ${booking.listing_price}` : 'N/A',
          'Action Required': 'The hunter is pleased. Contact the lister to arrange payout, then release funds in Treasury.',
        }
      )

      const { data: listing } = await admin
        .from('listings')
        .select('uploader_id, title')
        .eq('id', booking.listing_id)
        .maybeSingle()
      if (listing?.uploader_id) {
        await createNotification({
          userId: listing.uploader_id,
          category: 'transaction',
          title: `Hunter confirmed "${listing.title || 'your house'}"`,
          body: 'The hunter is pleased. Your payout can now be released.',
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id },
        })
      }

      return NextResponse.json({ success: true, message: 'Booking confirmed. The lister can now be paid.' })
    }

    // displeased → request an 85% refund. Admin records the actual M-Pesa
    // refund in Treasury, so money only moves after proof of payment.
    if (action === 'displeased') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'Please tell us why you are displeased' }, { status: 400 })
      }
      const refundPercent = REFUND_PERCENTAGES.VIEWED_CHANGED_MIND
      const refundAmount = Math.round((booking.listing_price || 0) * refundPercent)

      const { error } = await admin
        .from('house_bookings')
        .update({
          confirmed_at: now,
          displeased_reason: reason.trim(),
          rating: rating ?? null,
          release_status: 'refund_requested',
        })
        .eq('id', booking_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await notifyAdmins(
        'Refund Requested',
        'Hunter Displeased — 85% Refund',
        {
          House: booking.listing_title || 'N/A',
          'Hunter Phone': booking.phone || 'N/A',
          'Hunting Fee': booking.listing_price ? `KES ${booking.listing_price}` : 'N/A',
          Refund: `KES ${refundAmount} (85%)`,
          Reason: reason.trim(),
          'Action Required': 'Send the 85% refund by M-Pesa, then record the payout SMS in Treasury. The lister gets nothing.',
        }
      )

      if (booking.user_id) {
        await createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Refund requested',
          body: `An 85% refund (KES ${refundAmount.toLocaleString()}) for ${booking.listing_title || 'your house'} is awaiting processing. Our team will send it within 24 hours.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id, amount: refundAmount },
        })
      }

      return NextResponse.json({ success: true, message: `85% refund (KES ${refundAmount.toLocaleString()}) requested. Our team will process it within 24 hours.` })
    }

    // fake_no_show → request a 100% refund. Admin records the actual payout.
    if (action === 'fake_no_show') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'Please tell us why this is fake or no-show' }, { status: 400 })
      }
      const refundPercent = REFUND_PERCENTAGES.FAKE_NO_SHOW
      const refundAmount = Math.round((booking.listing_price || 0) * refundPercent)

      const { error } = await admin
        .from('house_bookings')
        .update({
          confirmed_at: now,
          displeased_reason: `fake_no_show: ${reason.trim()}`,
          rating: rating ?? null,
          release_status: 'refund_requested',
        })
        .eq('id', booking_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await notifyAdmins(
        'Refund Requested',
        'Fake/No-Show — 100% Refund',
        {
          House: booking.listing_title || 'N/A',
          'Hunter Phone': booking.phone || 'N/A',
          'Hunting Fee': booking.listing_price ? `KES ${booking.listing_price}` : 'N/A',
          Refund: `KES ${refundAmount} (100%)`,
          Reason: reason.trim(),
          'Action Required': 'Send the 100% refund by M-Pesa, then record the payout SMS in Treasury. The lister gets nothing.',
        }
      )

      if (booking.user_id) {
        await createNotification({
          userId: booking.user_id,
          category: 'transaction',
          title: 'Refund requested',
          body: `A 100% refund (KES ${refundAmount.toLocaleString()}) for ${booking.listing_title || 'your house'} is awaiting processing. Our team will send it within 24 hours.`,
          link: '/my-bookings?tab=payments',
          data: { house_booking_id: booking.id, amount: refundAmount },
        })
      }

      return NextResponse.json({ success: true, message: `100% refund (KES ${refundAmount.toLocaleString()}) requested. Our team will process it within 24 hours.` })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
