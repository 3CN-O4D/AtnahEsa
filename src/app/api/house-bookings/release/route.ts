import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import { sendAdminPayoutPanelEmail } from '@/lib/email'
import { createNotification } from '@/lib/notifications'
import { OWNER_SHARE } from '@/lib/constants'
import { invalidateCached } from '@/lib/server-cache'
import {
  getIssueCategory,
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
      .select('id, status, release_status, listing_id, listing_title, listing_location, name, email, phone, listing_price, user_id, created_at, mpesa_receipt, payment_method, held_until')
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

    const { data: listing } = await admin
      .from('listings')
      .select('uploader_id, title, lister_phone')
      .eq('id', booking.listing_id)
      .maybeSingle()

    let listerName = 'Lister'
    let listerPhone = listing?.lister_phone || ''
    if (listing?.uploader_id) {
      const { data: listerProfile } = await admin
        .from('profiles')
        .select('full_name, phone')
        .eq('id', listing.uploader_id)
        .maybeSingle()
      if (listerProfile?.full_name) listerName = listerProfile.full_name
      if (!listerPhone && listerProfile?.phone) listerPhone = listerProfile.phone
    }

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

      // Hunter is satisfied: the house moves from "booked" to "taken". It stays
      // publicly visible but is no longer bookable. Only an admin can put it
      // back if something later goes wrong.
      await admin
        .from('listings')
        .update({ status: 'taken', taken_at: now })
        .eq('id', booking.listing_id)
        .eq('status', 'booked')
      invalidateCached('listings|')

      if (listing?.uploader_id) {
        await saveListerReview(admin, listing.uploader_id, user.id, ratingValue, reviewText)
      }

      // Email is slow (SMTP); send it after the hunter gets their confirmation
      // so the form never appears to hang.
      after(async () => {
        try {
          await notifyAdmins(
            'Booking Confirmed',
            'Hunter Pleased — Verify Before Paying',
            {
              House: booking.listing_title || 'N/A',
              'Hunter Phone': booking.phone || 'N/A',
              'Hunting Fee': booking.listing_price ? `KES ${booking.listing_price}` : 'N/A',
              Rating: `${ratingValue}/5`,
              Review: reviewText,
              'Lister M-Pesa': listerPhone || 'Not on file',
              'Action Required':
                'Review the confirmation in Admin → Booking reviews, contact the hunter and lister if anything looks off, then release the lister payout in Treasury and paste the M-Pesa SMS.',
            }
          )

          // Dedicated admin panel email: hunter payment details, lister payout
          // number and a link straight into the Treasury payout panel.
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
            payoutAmount: Math.round((Number(booking.listing_price) || 0) * OWNER_SHARE),
            confirmedAt: now,
            rating: ratingValue,
            reviewComment: reviewText,
          })
        } catch (err) {
          // The in-app admin notification above still stands if SMTP fails.
          console.error('Failed to email admin payout panel:', err)
        }
      })

      if (listing?.uploader_id) {
        await createNotification({
          userId: listing.uploader_id,
          category: 'transaction',
          title: `Hunter confirmed "${listing.title || 'your house'}"`,
          body: `The hunter rated you ${ratingValue}/5 and left a review. An admin verifies the booking before your 50% payout is released.`,
          link: '/my-bookings',
          data: { house_booking_id: booking.id, rating: ratingValue },
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Thanks! Your rating and review were saved. An admin will verify the booking before the lister is paid.',
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

    const feedback: BookingFeedback = {
      version: 1,
      outcome: 'issue',
      category: categoryId,
      details: detailsText,
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
        displeased_reason: serializeBookingFeedback(feedback),
        rating: ratingValue,
      })
      .eq('id', booking_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (listing?.uploader_id) {
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
            'Action Required':
              'Open Admin → Booking reviews. Contact the hunter and the lister, record your notes, then approve or decline. Only send the M-Pesa refund in Treasury after both parties have been reached.',
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
        title: 'Report received — under review',
        body: `Your report for ${booking.listing_title || 'your house'} is with our team. An admin will contact you and the lister before deciding on the ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}).`,
        link: '/my-bookings',
        data: { house_booking_id: booking.id, amount: refundAmount },
      })
    }

    if (listing?.uploader_id) {
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
      message: `Report received. An admin will contact you and the lister before processing the ${refundPercent}% refund (KES ${refundAmount.toLocaleString()}).`,
    })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
