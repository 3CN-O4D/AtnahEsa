import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { OWNER_SHARE } from '@/lib/constants'
import {
  getIssueCategory,
  parseBookingFeedback,
  refundPercentForFeedback,
  serializeBookingFeedback,
  type BookingFeedback,
  type IssueCategory,
} from '@/lib/booking-feedback'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { user }
}

type Row = Record<string, unknown> & {
  id: string
  status: string
  listing_id: string
  release_status: string
  rating: number | null
  displeased_reason: string | null
  confirmed_at: string | null
  listing_price: number | null
  mpesa_message: string | null
  mpesa_receipt: string | null
  user_id: string | null
}

/** Rebuild a structured feedback record from any row (legacy rows included). */
function feedbackFor(row: Row): BookingFeedback {
  const parsed = parseBookingFeedback(row.displeased_reason)
  if (parsed) return parsed
  if (row.confirmed_at && row.rating != null) {
    return {
      version: 1,
      outcome: 'pleased',
      category: 'pleased',
      details: '',
      review: '',
      rating: Number(row.rating) || 0,
      contacted_hunter_at: null,
      contacted_lister_at: null,
      admin_note: '',
      decision: null,
      decided_at: null,
    }
  }
  return {
    version: 1,
    outcome: 'issue',
    category: 'other',
    details: row.displeased_reason || '',
    review: '',
    rating: Number(row.rating) || 0,
    contacted_hunter_at: null,
    contacted_lister_at: null,
    admin_note: '',
    decision: null,
    decided_at: null,
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('house_bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = (rows || []) as Row[]
  const listingIds = Array.from(new Set(all.map((row) => row.listing_id).filter(Boolean)))
  const { data: listings } = listingIds.length
    ? await admin.from('listings').select('id, uploader_id, lister_phone, title').in('id', listingIds)
    : { data: [] as Array<{ id: string; uploader_id: string | null; lister_phone: string | null; title: string }> }

  const uploaderIds = Array.from(new Set((listings || []).map((l) => l.uploader_id).filter(Boolean))) as string[]
  const { data: profiles } = uploaderIds.length
    ? await admin.from('profiles').select('id, full_name, phone').in('id', uploaderIds)
    : { data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> }

  const listingById = new Map((listings || []).map((l) => [l.id, l]))
  const profileById = new Map((profiles || []).map((p) => [p.id, p]))

  const enrich = (row: Row) => {
    const listing = listingById.get(row.listing_id)
    const lister = listing?.uploader_id ? profileById.get(listing.uploader_id) : undefined
    const feedback = feedbackFor(row)
    const price = Number(row.listing_price) || 0
    return {
      ...row,
      feedback,
      lister_name: lister?.full_name || null,
      lister_phone: listing?.lister_phone || lister?.phone || null,
      payout_amount: Math.round(price * OWNER_SHARE),
      refund_percent: refundPercentForFeedback(feedback),
      refund_amount: Math.round(price * (refundPercentForFeedback(feedback) / 100)),
      issue_label: feedback.outcome === 'issue' ? getIssueCategory(feedback.category).label : 'Pleased',
    }
  }

  const enriched = all.map(enrich)

  // Attach the hunter's latest payment attempt so the admin can see claims
  // ("I paid but the site still says pending") and the pasted M-Pesa SMS.
  const bookingIds = enriched.map((row) => row.id)
  const { data: linkedTransactions } = bookingIds.length
    ? await admin
        .from('transactions')
        .select('*')
        .filter('raw_callback->>house_booking_id', 'in', `(${bookingIds.join(',')})`)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> }

  const latestTx = new Map<string, Record<string, unknown>>()
  for (const tx of linkedTransactions || []) {
    const linked = (tx.raw_callback as Record<string, unknown> | null)?.house_booking_id
    if (typeof linked === 'string' && !latestTx.has(linked)) latestTx.set(linked, tx)
  }

  const withPayments = enriched.map((row) => {
    const tx = latestTx.get(row.id)
    return {
      ...row,
      payment_status: (tx?.status as string) || null,
      payment_receipt: (tx?.mpesa_receipt as string) || row.mpesa_receipt || null,
      payment_message: (tx?.mpesa_message as string) || row.mpesa_message || null,
      payment_result: (tx?.result_desc as string) || null,
      transaction_id: (tx?.id as string) || null,
    }
  })

  const paymentClaims = withPayments.filter(
    (row) =>
      row.release_status !== 'paid' &&
      row.release_status !== 'refunded' &&
      (row.payment_status === 'verifying' ||
        (row.release_status === 'pending' &&
          !row.mpesa_receipt &&
          typeof row.mpesa_message === 'string' &&
          row.mpesa_message.trim().length > 20))
  )

  // `house_bookings.release_status` is constrained to pending/held/paid/refunded
  // on the live database, so an open refund review is a held booking whose
  // structured feedback is an issue without a decision (or with an approval
  // that still has to be paid out in Treasury).
  const isOpenRefund = (row: (typeof withPayments)[number]) =>
    row.release_status === 'held' &&
    !!row.confirmed_at &&
    row.feedback.outcome === 'issue' &&
    row.feedback.decision !== 'refund_declined'
  const pendingPayouts = withPayments.filter(
    (row) => row.release_status === 'held' && !!row.confirmed_at && !isOpenRefund(row)
  )
  const refundRequests = withPayments.filter(isOpenRefund)
  const awaitingConfirmation = withPayments.filter(
    (row) => row.release_status === 'held' && !row.confirmed_at
  )
  const resolved = withPayments
    .filter((row) => row.release_status === 'paid' || row.release_status === 'refunded')
    .slice(0, 25)

  return NextResponse.json({
    pending_payouts: pendingPayouts,
    refund_requests: refundRequests,
    payment_claims: paymentClaims,
    awaiting_confirmation: awaitingConfirmation,
    resolved,
    counts: {
      pending_payouts: pendingPayouts.length,
      refund_requests: refundRequests.length,
      payment_claims: paymentClaims.length,
      awaiting_confirmation: awaitingConfirmation.length,
    },
  })
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({}))
  const bookingId = typeof body.booking_id === 'string' ? body.booking_id : ''
  const action = typeof body.action === 'string' ? body.action : ''
  if (!bookingId || !action) {
    return NextResponse.json({ error: 'booking_id and action are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('house_bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const typed = row as Row
  const feedback = feedbackFor(typed)
  const now = new Date().toISOString()

  if (action === 'contacted_hunter' || action === 'contacted_lister') {
    const key = action === 'contacted_hunter' ? 'contacted_hunter_at' : 'contacted_lister_at'
    feedback[key] = feedback[key] ? null : now
  } else if (action === 'save_note') {
    feedback.admin_note = typeof body.note === 'string' ? body.note.slice(0, 2000) : ''
  } else if (action === 'decline_refund') {
    if (feedback.outcome !== 'issue' || !typed.confirmed_at || typed.release_status !== 'held') {
      return NextResponse.json({ error: 'This booking is not awaiting a refund decision' }, { status: 400 })
    }
    feedback.decision = 'refund_declined'
    feedback.decided_at = now
    if (typeof body.note === 'string' && body.note.trim()) feedback.admin_note = body.note.trim().slice(0, 2000)

    // release_status stays `held`: with the refund declined, the booking is
    // back in the lister payout queue.
    const { error: updateError } = await admin
      .from('house_bookings')
      .update({ displeased_reason: serializeBookingFeedback(feedback) })
      .eq('id', bookingId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    if (typed.user_id) {
      await createNotification({
        userId: typed.user_id,
        category: 'transaction',
        title: 'Report reviewed',
        body: 'After speaking to both sides, our team could not approve a refund for this viewing. You can contact support if you have new information.',
        link: '/my-bookings',
        data: { house_booking_id: bookingId },
      })
    }
    return NextResponse.json({ success: true, feedback })
  } else if (action === 'approve_refund') {
    if (feedback.outcome !== 'issue' || !typed.confirmed_at || typed.release_status !== 'held') {
      return NextResponse.json({ error: 'This booking is not awaiting a refund decision' }, { status: 400 })
    }
    feedback.decision = 'refund_approved'
    feedback.decided_at = now
    if (typeof body.note === 'string' && body.note.trim()) feedback.admin_note = body.note.trim().slice(0, 2000)
  } else if (action === 'set_category') {
    const category = getIssueCategory(body.category as IssueCategory).id
    feedback.category = category
  } else {
    return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 })
  }

  const { error: updateError } = await admin
    .from('house_bookings')
    .update({ displeased_reason: serializeBookingFeedback(feedback) })
    .eq('id', bookingId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, feedback })
}
