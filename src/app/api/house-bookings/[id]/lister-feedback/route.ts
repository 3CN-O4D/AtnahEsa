import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'
import {
  parseListerFeedback,
  withListerFeedback,
  type ListerFeedback,
  type ListerFeedbackOutcome,
} from '@/lib/booking-feedback'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Listing-owner feedback on a paid viewing.
 *
 * This is advisory. It never changes `release_status`, approves a payout, or
 * starts a refund — only admins can move money in Treasury. It is stored in
 * the same serialized feedback record as the hunter's report so it works on
 * the live database without a migration.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await params
    const body = await req.json().catch(() => ({}))
    const outcome: ListerFeedbackOutcome | null =
      body.outcome === 'viewing_confirmed' || body.outcome === 'issue' ? body.outcome : null
    if (!outcome) {
      return NextResponse.json({ error: 'Choose confirm viewing or report a problem' }, { status: 400 })
    }
    const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : ''
    const reasons: string[] = Array.isArray(body.reasons)
      ? [...new Set(
          (body.reasons as unknown[])
            .filter((r): r is string => typeof r === 'string')
            .map((r) => r.slice(0, 80))
        )]
      : []
    if (outcome === 'issue' && details.length < 5 && reasons.length === 0) {
      return NextResponse.json({ error: 'Choose a reason or describe the problem briefly' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to manage your listing' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: bookingData, error: bookingError } = await admin
      .from('house_bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle()
    if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 })
    if (!bookingData) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const booking = bookingData as Record<string, unknown>
    const { data: listing } = await admin
      .from('listings')
      .select('uploader_id, title, lister_phone')
      .eq('id', booking.listing_id)
      .maybeSingle()
    const { data: profile } = await admin
      .from('profiles')
      .select('role, full_name, phone')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin'
    if (!isAdmin && listing?.uploader_id !== user.id) {
      return NextResponse.json({ error: 'This booking is not on your listing' }, { status: 403 })
    }

    const escrowStarted =
      booking.status === 'confirmed' ||
      ['held', 'paid', 'released', 'refunded'].includes(String(booking.release_status || ''))
    if (!escrowStarted) {
      return NextResponse.json(
        { error: 'You can confirm or report a viewing once the hunter has paid and the escrow is open.' },
        { status: 409 }
      )
    }

    const previous = parseListerFeedback(String(booking.displeased_reason || ''))
    if (previous) {
      return NextResponse.json(
        { error: 'You have already sent feedback for this viewing. Contact support if you need to change it.' },
        { status: 409 }
      )
    }

    const feedback: ListerFeedback = {
      outcome,
      details: outcome === 'issue' ? details : '',
      reasons: outcome === 'issue' && reasons.length ? reasons : undefined,
      submitted_at: new Date().toISOString(),
    }
    const updatedFeedback = withListerFeedback(String(booking.displeased_reason || ''), feedback)
    const { error: updateError } = await admin
      .from('house_bookings')
      .update({ displeased_reason: updatedFeedback })
      .eq('id', bookingId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    after(async () => {
      try {
        await notifyAdmins(
          outcome === 'issue' ? 'Lister Reported a Viewing Problem' : 'Lister Confirmed a Viewing',
          outcome === 'issue' ? 'Lister report — review before payout' : 'Lister confirmed the viewing',
          {
            House: booking.listing_title ? String(booking.listing_title) : listing?.title || 'N/A',
            'Booking ID': bookingId,
            Hunter: String(booking.name || 'N/A'),
            'Hunter Phone': String(booking.phone || 'N/A'),
            Lister: profile?.full_name || 'Listing owner',
            'Lister Phone': profile?.phone || String(listing?.lister_phone || 'N/A'),
            ...(outcome === 'issue'
              ? {
                  Reasons: reasons.join(', ') || 'not provided',
                  'What happened': details || 'not provided',
                }
              : {}),
            'Money moved': 'No. Escrow is unchanged; only an admin may release or refund funds in Treasury.',
            'Action required':
              outcome === 'issue'
                ? 'Contact both parties, record notes in Admin → Booking reviews, then decide. Do not pay the lister while the report is open.'
                : 'No payout has been made. Verify the viewing and record the B2C M-Pesa receipt in Admin → Treasury before marking the lister paid.',
          }
        )
      } catch (err) {
        console.error('[lister-feedback] admin notification failed:', err)
      }
    })

    return NextResponse.json({
      success: true,
      feedback,
      displeased_reason: updatedFeedback,
      message:
        outcome === 'issue'
          ? 'Report sent. An admin will contact both sides before any money moves.'
          : 'Viewing confirmed. An admin will still verify and record the M-Pesa payout before you are paid.',
    })
  } catch (error) {
    console.error('[lister-feedback] failed:', error)
    return NextResponse.json({ error: 'Could not save your feedback' }, { status: 500 })
  }
}
