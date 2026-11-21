import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import { sendAdminPayoutPanelEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { invalidateCached } from '@/lib/server-cache'
import { approveHouseBookingPayout } from '@/lib/payments'
import { canReportLateAfterAutoApproval } from '@/lib/booking-workflow'
import { resolveListerIdentity } from '@/lib/lister-identity'
import {
  getIssueCategory,
  parseBookingFeedback,
  serializeBookingFeedback,
  type BookingFeedback,
  type IssueCategory,
} from '@/lib/booking-feedback'

/**
 * Hunter-facing actions on a paid house booking (public Tuma flow):
 *   - confirm: hunter is pleased. The booking enters the admin payout queue
 *     and no money moves until an admin verifies it in Treasury.
 *   - displeased / fake_no_show: hunter reports a problem. The booking enters
 *     the admin refund-review queue. An admin contacts both parties before
 *     approving a refund.
 *
 * Both outcomes capture a 1–5 lister rating and a written review.
 */

type AdminClient = ReturnType<typeof createAdminClient>

async function saveListerReview(
  admin: AdminClient,
  listerId: string,
  reviewerId: string,
  rating: number,
  comment: string
) {
  if (!listerId || !comment) return
  const { data: existing } = await admin
    .from('lister_reviews')
    .select('id')
    .eq('lister_id', listerId)
    .eq('reviewer_id', reviewerId)
    .limit(1)
  if (existing && existing.length > 0) return

  const { error } = await admin.from('lister_reviews').insert({
    lister_id: listerId,
    reviewer_id: reviewerId,
    // lister_reviews.booking_id references `bookings`, not `house_bookings`.
    booking_id: null,
    rating,
    comment,
    is_anonymous: false,
  })
  if (error) {
    console.error('Failed to save lister review:', error.message)
    return
  }

  // Keep the public profile rating in sync even if the DB trigger is absent.
  const { data: rows } = await admin
    .from('lister_reviews')
    .select('rating')
    .eq('lister_id', listerId)
  if (rows && rows.length > 0) {
    const total = rows.reduce((sum, row) => sum + (Number(row.rating) || 0), 0)
    await admin
      .from('profiles')
      .update({
        average_rating: Math.round((total / rows.length) * 100) / 100,
        total_reviews: rows.length,
      })
      .eq('id', listerId)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { booking_id, action, rating, reason, category, details, comment } = body

    if (!booking_id || !action) {
      return NextResponse.json({ error: 'booking_id and action are required' }, { status: 400 })
    }
    if (!['confirm', 'displeased', 'fake_no_show'].includes(action)) {
      return NextResponse.json({ error: 'Action must be confirm, displeased, or fake_no_show' }, { status: 400 })
    }

    const ratingValue = Number(rating)
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return NextResponse.json({ error: 'Please rate the lister from 1 to 5 stars' }, { status: 400 })
    }
    const reviewText = typeof comment === 'string' ? comment.trim() : ''
    if (reviewText.length < 3) {
      return NextResponse.json({ error: 'Please write a short review for the lister' }, { status: 400 })
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
      .select('id, status, release_status, listing_id, listing_title, listing_location, name, email, phone, listing_price, user_id, created_at, mpesa_receipt, payment_method, held_until, displeased_reason, confirmed_at, rating')
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

    // Repeated taps must not overwrite the first report or resend admin alerts.
    // Exception: if the 24h cron auto-approved a "no report = success" payout,
    // the hunter can still report a problem while the money is held and before
    // Treasury records the B2C receipt.
    const existingFeedback = parseBookingFeedback(booking.displeased_reason)
    const legacyFeedback = !!booking.confirmed_at && booking.rating != null
    const lateReportAfterAutoApproval =
      action !== 'confirm' && canReportLateAfterAutoApproval(booking as never)
    if ((existingFeedback || legacyFeedback) && !lateReportAfterAutoApproval) {
      return NextResponse.json(
        { error: 'You already submitted feedback for this viewing.', code: 'FEEDBACK_ALREADY_SUBMITTED' },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()

    const { data: listing } = await admin
      .from('listings')
      .select('uploader_id, uploader_name, title, lister_phone')
      .eq('id', booking.listing_id)
      .maybeSingle()

    const {
      name: listerName,
      phone: listerPhone,
      profile: listerProfile,
    } = await resolveListerIdentity(admin, listing)
    const isAdminManagedListing = listerProfile?.role === 'admin'

    if (action === 'confirm') {
      const feedback: BookingFeedback = {
        version: 1,
        outcome: 'pleased',
        category: 'pleased',
        details: '',
        review: reviewText,
        rating: ratingValue,
        contacted_hunter_at: null,
        contacted_lister_at: null,
        admin_note: '',
        decision: null,
        decided_at: null,
      }

      const { error } = await admin
        .from('house_bookings')
        .update({
          confirmed_at: now,
          rating: ratingValue,
          displeased_reason: serializeBookingFeedback(feedback),
        })
        .eq('id', booking_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (listing?.uploader_id && !isAdminManagedListing) {
        await saveListerReview(admin, listing.uploader_id, user.id, ratingValue, reviewText)
      }

      // Success closes the viewing and approves the lister's share. The real
      // M-Pesa B2C is sent by an admin, who records the SMS in Treasury — that
      // is the only thing that marks the booking `paid`.
      const release = await approveHouseBookingPayout(admin, {
        bookingId: booking.id,
        reason: 'Hunter confirmed a successful viewing',
        feedback,
      })

      after(async () => {
        try {
          await sendAdminPayoutPanelEmail({
            bookingId: booking.id,
            listingTitle: booking.listing_title || 'House listing',
            listingLocation: booking.listing_location || '',
            hunterName: booking.name || '',
            hunterPhone: booking.phone || '',
            hunterEmail: booking.email || '',
            amount: Number(booking.listing_price) || 0,
            receipt: booking.mpesa_receipt || null,
            paymentMethod: booking.payment_method || null,
            listerName,
            listerPhone: listerPhone || null,
            payoutAmount: release.payoutAmount,
            confirmedAt: now,
            rating: ratingValue,
            reviewComment: reviewText,
          })
        } catch (err) {
          console.error('Failed to email admin payout panel:', err)
        }
      })

      return NextResponse.json({
        success: true,
        message: 'Viewing complete! The lister’s 50% payout has been approved and our admin team has been notified to send it by M-Pesa.',
        phase: 'awaiting_payout',
        payout_amount: release.payoutAmount,
      })
    }

    // ---- Hunter reports a problem. Admin reviews before any refund. ----
    const isFakeOrNoShow = action === 'fake_no_show'
    const categoryId: IssueCategory = isFakeOrNoShow
      ? 'fake_listing'
      : getIssueCategory(category).id
    const categoryMeta = getIssueCategory(categoryId)
    const detailsText = String(details ?? reason ?? '').trim()
    if (!detailsText) {
      return NextResponse.json({ error: 'Please tell us what happened' }, { status: 400 })
    }

    const refundPercent = categoryMeta.refundPercent
    const refundAmount = Math.round((booking.listing_price || 0) * (refundPercent / 100))
    // Clear no-shows, fake listings and payments that arrived after a
    // cancellation are pre-approved. Treasury still has to send the money and
    // paste the M-Pesa refund SMS, but the hunter does not wait for a second
    // approval click.
    const autoApproved = refundPercent === 100

    const feedback: BookingFeedback = {
      version: 1,
      outcome: 'issue',
      category: categoryId,
      details: detailsText,
      review: reviewText,
      rating: ratingValue,
      contacted_hunter_at: now,
      contacted_lister_at: null,
      admin_note: autoApproved
        ? 'Automatically approved: clear no-show, fake listing or cancelled-payment case.'
        : '',
      decision: autoApproved ? 'refund_approved' : null,
      decided_at: autoApproved ? now : null,
    }

    const { error } = await admin
      .from('house_bookings')
      .update({
        confirmed_at: now,
        displeased_reason: serializeBookingFeedback(feedback),
        rating: ratingValue,
      })
      .eq('id', booking_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (listing?.uploader_id && !isAdminManagedListing) {
      await saveListerReview(admin, listing.uploader_id, user.id, ratingValue, reviewText)
    }

    // Email is slow (SMTP); send it after the hunter gets their confirmation.
    after(async () => {
      try {
        await notifyAdmins(
          'Refund Requested',
          `${categoryMeta.label} — review before refunding`,
          {
            House: booking.listing_title || 'N/A',
            'Hunter Phone': booking.phone || 'N/A',
            'Hunting Fee': booking.listing_price ? `KES ${booking.listing_price}` : 'N/A',
            Issue: categoryMeta.label,
            'What happened': detailsText,
            Rating: `${ratingValue}/5`,
            Review: reviewText,
            'Refund requested': `KES ${refundAmount} (${refundPercent}%)`,
            'Lister contact': `${listerName}${listerPhone ? ` · ${listerPhone}` : ' · no number on file'}`,
            'Action Required': autoApproved
              ? 'Refund is pre-approved. Send the M-Pesa refund now and paste the confirmation SMS in Admin → Treasury. Do not pay the lister.'
              : 'Open Admin → Booking reviews. Contact the hunter and the lister, record your notes, then approve or decline. Only send the M-Pesa refund in Treasury after both parties have been reached.',
          }
        )
      } catch (err) {
        console.error('Failed to email admins about the refund request:', err)
      }
    })

    if (booking.user_id) {
      await createNotification({
        userId: booking.user_id,
        category: 'transaction',
        title: autoApproved ? 'Full refund approved' : 'Report received — under review',
        body: autoApproved
          ? `Your ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}) for ${booking.listing_title || 'your house'} was approved. An admin will send it by M-Pesa and record the receipt; the lister will not be paid.`
          : `Your report for ${booking.listing_title || 'your house'} is with our team. An admin will contact you and the lister before deciding on the ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}).`,
        link: '/my-escrow',
        data: { house_booking_id: booking.id, amount: refundAmount },
      })
    }

    if (listing?.uploader_id && !isAdminManagedListing) {
      await createNotification({
        userId: listing.uploader_id,
        category: 'transaction',
        title: `A viewing report was filed for "${listing.title || 'your house'}"`,
        body: 'An admin will contact you to hear your side before any decision is made. Please keep your phone reachable.',
        link: '/my-bookings',
        data: { house_booking_id: booking.id },
      })
    }

    return NextResponse.json({
      success: true,
      message: autoApproved
        ? `Your ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}) was approved. An admin will send it by M-Pesa shortly and record the SMS receipt.`
        : `Report received. An admin will contact you and the lister before processing the ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}).`,
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
