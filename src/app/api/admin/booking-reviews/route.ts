import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { OWNER_SHARE, CONTACT_PHONE_DISPLAY } from '@/lib/constants'
import { notifyAdmins } from '@/lib/notify'
import { notifyPhoneWhatsApp } from '@/lib/whatsapp/outbox'
import { isValidMpesaMessage } from '@/lib/paywave'
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
  phone: string | null
  listing_title: string | null
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
    ? await admin.from('listings').select('id, uploader_id, uploader_name, lister_phone, title').in('id', listingIds)
    : { data: [] as Array<{ id: string; uploader_id: string | null; uploader_name: string | null; lister_phone: string | null; title: string }> }

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
      lister_name: listing?.uploader_name || lister?.full_name || null,
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

  // The STK initiation writes a placeholder message, so a length check alone
  // made every started payment look like a claim. Only real M-Pesa text counts.
  const isRealSmsClaim = (value: unknown) =>
    typeof value === 'string' && value.trim().length > 20 && isValidMpesaMessage(value.trim())

  const paymentClaims = withPayments.filter(
    (row) =>
      row.release_status !== 'paid' &&
      row.release_status !== 'refunded' &&
      (row.payment_status === 'verifying' ||
        (row.release_status === 'pending' && !row.mpesa_receipt && isRealSmsClaim(row.mpesa_message)))
  )

  // `house_bookings.release_status` is constrained to pending/held/paid/refunded
  // on the live database, so an open refund review is a held booking whose
  // structured feedback is an issue without a decision (or with an approval
  // that still has to be paid out in Treasury). Feedback presence is derived
  // from displeased_reason: confirmed_at can be stale on older rows.
  // Legacy happy feedback had a rating but no serialized reason.
  const hasFeedback = (row: Row) =>
    !!parseBookingFeedback(row.displeased_reason) || (!!row.confirmed_at && row.rating != null)
  const isOpenRefund = (row: (typeof withPayments)[number]) =>
    row.release_status === 'held' &&
    hasFeedback(row) &&
    row.feedback.outcome === 'issue' &&
    row.feedback.decision !== 'refund_declined'
  const pendingPayouts = withPayments.filter(
    (row) => row.release_status === 'held' && hasFeedback(row) && !isOpenRefund(row)
  )
  const refundRequests = withPayments.filter(isOpenRefund)
  const awaitingConfirmation = withPayments.filter(
    (row) => row.release_status === 'held' && !hasFeedback(row)
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
    if (feedback.outcome !== 'issue' || !parseBookingFeedback(typed.displeased_reason) || typed.release_status !== 'held') {
      return NextResponse.json({ error: 'This booking is not awaiting a refund decision' }, { status: 400 })
    }
    if (feedback.decision === 'refund_declined') {
      return NextResponse.json({ success: true, already_decided: true, feedback })
    }
    if (feedback.decision) {
      return NextResponse.json(
        { error: 'This report was already approved. Reopen it before declining.' },
        { status: 409 }
      )
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
        link: '/my-escrow',
        data: { house_booking_id: bookingId },
      })
    }
    return NextResponse.json({ success: true, feedback })
  } else if (action === 'approve_refund') {
    if (feedback.outcome !== 'issue' || !parseBookingFeedback(typed.displeased_reason) || typed.release_status !== 'held') {
      return NextResponse.json({ error: 'This booking is not awaiting a refund decision' }, { status: 400 })
    }
    if (feedback.decision === 'refund_approved') {
      return NextResponse.json({ success: true, already_decided: true, feedback })
    }
    if (feedback.decision) {
      return NextResponse.json(
        { error: 'This report was already declined. Reopen it before approving.' },
        { status: 409 }
      )
    }
    feedback.decision = 'refund_approved'
    feedback.decided_at = now
    if (typeof body.note === 'string' && body.note.trim()) feedback.admin_note = body.note.trim().slice(0, 2000)
  } else if (action === 'reopen_issue') {
    if (feedback.outcome !== 'issue' || typed.release_status !== 'held') {
      return NextResponse.json({ error: 'Only an open escrow report can be reopened' }, { status: 400 })
    }
    feedback.decision = null
    feedback.decided_at = null
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

  if (action === 'approve_refund') {
    const percent = refundPercentForFeedback(feedback)
    const amount = Math.round(Number(typed.listing_price || 0) * (percent / 100))
    const title = `${percent}% refund approved`
    if (typed.user_id) {
      await createNotification({
        userId: typed.user_id,
        category: 'transaction',
        title,
        body: `Your report for ${typed.listing_title || 'your house'} was approved. An admin will send KES ${amount.toLocaleString()} by M-Pesa and record the receipt; the lister will not be paid.`,
        link: '/my-escrow',
        data: { house_booking_id: bookingId, refund_percent: percent, amount },
      })
    }
    await Promise.allSettled([
      notifyPhoneWhatsApp(
        typed.phone,
        'Refund Approved',
        'Your refund was approved 💰',
        {
          House: typed.listing_title || 'your house',
          Amount: `KES ${amount.toLocaleString()} (${percent}%)`,
          Status: 'An admin will send the refund by M-Pesa and record the receipt. The lister will not be paid.',
          Questions: `Call ${CONTACT_PHONE_DISPLAY} if you need details.`,
        }
      ),
      notifyAdmins('Refund Approved — Send M-Pesa', 'Refund Approved', {
        House: typed.listing_title || typed.listing_id,
        Amount: `KES ${amount.toLocaleString()} (${percent}%)`,
        Receipt: 'Pending',
        'Action Required': `Send the M-Pesa refund now, then record it in Admin → Treasury with the SMS for booking ${bookingId}.`,
        'Booking ID': bookingId,
      }),
    ])
  }

  if (action === 'decline_refund') {
    if (typed.user_id) {
      await createNotification({
        userId: typed.user_id,
        category: 'transaction',
        title: 'Report reviewed — no refund',
        body: `Our team reviewed your report for ${typed.listing_title || 'your house'} after speaking to both sides. No refund was approved. Contact support if you have new information.`,
        link: '/my-escrow',
        data: { house_booking_id: bookingId, refund_percent: 0 },
      })
    }
    await Promise.allSettled([
      notifyPhoneWhatsApp(
        typed.phone,
        'Report Reviewed',
        'Refund report reviewed',
        {
          House: typed.listing_title || 'your house',
          Decision: 'No refund was approved after reviewing both sides.',
          Status: 'The booking has returned to the payout queue. Call us if you have new information.',
          Questions: `Call ${CONTACT_PHONE_DISPLAY}.`,
        }
      ),
      notifyAdmins('Refund Report Declined', 'Refund Declined', {
        House: typed.listing_title || typed.listing_id,
        'Booking ID': bookingId,
        Note: feedback.admin_note || 'No note recorded',
        'Next Step': 'The booking has returned to the lister payout queue. Reopen the report if new evidence arrives.',
      }),
    ])
  }

  if (action === 'reopen_issue') {
    await notifyAdmins('Refund Report Reopened', 'Decision Cleared', {
      House: typed.listing_title || typed.listing_id,
      'Booking ID': bookingId,
      Action: 'Review the report again and approve or decline it.',
    })
  }

  return NextResponse.json({ success: true, feedback })
}
