import {
  parseBookingFeedback,
  refundPercentForFeedback,
  serializeBookingFeedback,
  type BookingFeedback,
} from '@/lib/booking-feedback'

/**
 * Single source of truth for house-booking states.
 *
 * The live database only allows `status` in
 * pending/contacted/confirmed/completed/cancelled and `release_status` in
 * pending/held/paid/refunded. Everything else (feedback, refund approval,
 * cancellation) is derived from the serialized feedback column so we never
 * depend on an unapplied migration.
 */

export type BookingPhase =
  | 'awaiting_payment'
  | 'payment_under_review'
  | 'payment_received_unapplied'
  | 'payment_failed'
  | 'escrow_held'
  | 'awaiting_payout'
  | 'issue_open'
  | 'refund_approved'
  | 'refund_declined'
  | 'refunded'
  | 'paid'
  | 'cancelled'

export type BookingAction =
  | 'pay'
  | 'cancel'
  | 'confirm_pleased'
  | 'report_issue'
  | 'contact_support'
  | 'view_status'
  | 'view_receipt'
  | 'book_again'

export type WorkflowRow = {
  status?: string | null
  release_status?: string | null
  paid_at?: string | null
  refunded_at?: string | null
  confirmed_at?: string | null
  rating?: number | null
  displeased_reason?: string | null
  mpesa_message?: string | null
}

export type WorkflowPayment = {
  status?: string | null
  mpesa_message?: string | null
}

export type BookingState = {
  phase: BookingPhase
  feedback: BookingFeedback | null
  hasFeedback: boolean
  refundPercent: number
  label: string
  description: string
  payerActions: BookingAction[]
  adminActions: string[]
}

const PHASE_COPY: Record<BookingPhase, { label: string; description: string; payerActions: BookingAction[]; adminActions: string[] }> = {
  awaiting_payment: {
    label: 'Awaiting payment',
    description: 'Your booking is reserved. Complete the M-Pesa payment to put the fee in escrow.',
    payerActions: ['pay', 'cancel'],
    adminActions: ['expire_stale_booking'],
  },
  payment_under_review: {
    label: 'Payment under review',
    description: 'We received your payment claim. An admin is verifying the M-Pesa receipt; do not pay again.',
    payerActions: ['cancel', 'contact_support'],
    adminActions: ['verify_payment_from_sms', 'decline_payment_claim'],
  },
  payment_received_unapplied: {
    label: 'Payment received — verifying',
    description: 'M-Pesa shows a successful payment. An admin is attaching it to this booking; do not pay again.',
    payerActions: ['contact_support', 'view_status'],
    adminActions: ['verify_payment_from_sms'],
  },
  payment_failed: {
    label: 'Payment not completed',
    description: 'That M-Pesa attempt did not complete. You can retry or cancel the booking.',
    payerActions: ['pay', 'cancel'],
    adminActions: ['expire_stale_booking'],
  },
  escrow_held: {
    label: 'In escrow — view the house',
    description: 'Your payment is held safely. After the viewing, tell us whether the house matched the listing.',
    payerActions: ['confirm_pleased', 'report_issue', 'contact_support'],
    adminActions: ['remind_hunter', 'escalate_no_feedback'],
  },
  awaiting_payout: {
    label: 'Confirmed — payout pending',
    description: 'Thanks for confirming. An admin verifies the booking and pays the lister by M-Pesa.',
    payerActions: ['view_status', 'contact_support'],
    adminActions: ['record_lister_payout'],
  },
  issue_open: {
    label: 'Report under review',
    description: 'An admin is contacting both sides. No money moves until the review is complete.',
    payerActions: ['view_status', 'contact_support'],
    adminActions: ['contact_hunter', 'contact_lister', 'save_note', 'approve_refund', 'decline_refund'],
  },
  refund_approved: {
    label: 'Refund approved',
    description: 'Your refund was approved. An admin will send it by M-Pesa and record the receipt.',
    payerActions: ['view_status', 'contact_support'],
    adminActions: ['record_refund'],
  },
  refund_declined: {
    label: 'Report reviewed — no refund',
    description: 'The admin reviewed both sides and could not approve a refund. Contact support with new information.',
    payerActions: ['contact_support', 'view_status'],
    adminActions: ['record_lister_payout', 'reopen_issue'],
  },
  refunded: {
    label: 'Refund completed',
    description: 'Your refund has been sent by M-Pesa and recorded.',
    payerActions: ['view_receipt', 'book_again', 'contact_support'],
    adminActions: ['manage_listing'],
  },
  paid: {
    label: 'Completed',
    description: 'The viewing is complete and the lister has been paid.',
    payerActions: ['view_receipt', 'book_again', 'contact_support'],
    adminActions: [],
  },
  cancelled: {
    label: 'Cancelled',
    description: 'This booking was cancelled before payment was completed. No viewing fee was taken.',
    payerActions: ['book_again'],
    adminActions: [],
  },
}

function hasStructuredFeedback(row: WorkflowRow): boolean {
  return !!parseBookingFeedback(row.displeased_reason)
}

function deriveFeedback(row: WorkflowRow): BookingFeedback | null {
  const parsed = parseBookingFeedback(row.displeased_reason)
  if (parsed) return parsed
  // Legacy happy path: rating + confirmed_at before serialized feedback existed.
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
  return null
}

export function deriveBookingState(row: WorkflowRow, payment?: WorkflowPayment | null): BookingState {
  const feedback = deriveFeedback(row)
  const hasFeedback = hasStructuredFeedback(row) || (!!row.confirmed_at && row.rating != null)
  const refundPercent = refundPercentForFeedback(feedback)
  const release = row.release_status || 'pending'
  const status = row.status || 'pending'
  const paymentStatus = String(payment?.status || '').toLowerCase()
  const pastedClaim =
    !payment && typeof row.mpesa_message === 'string' && row.mpesa_message.trim().length > 20

  let phase: BookingPhase
  if (status === 'cancelled') {
    phase = 'cancelled'
  } else if (release === 'refunded' || row.refunded_at) {
    phase = 'refunded'
  } else if (release === 'paid' || status === 'completed') {
    phase = 'paid'
  } else if (feedback?.outcome === 'issue') {
    if (feedback.decision === 'refund_approved') phase = 'refund_approved'
    else if (feedback.decision === 'refund_declined') phase = 'refund_declined'
    else phase = 'issue_open'
  } else if (feedback?.outcome === 'pleased') {
    phase = 'awaiting_payout'
  } else if (release === 'held' && status === 'confirmed') {
    phase = 'escrow_held'
  } else if (paymentStatus === 'success' || (release === 'held' && !status)) {
    phase = 'payment_received_unapplied'
  } else if (paymentStatus === 'verifying' || pastedClaim) {
    phase = 'payment_under_review'
  } else if (paymentStatus === 'failed') {
    phase = 'payment_failed'
  } else {
    phase = 'awaiting_payment'
  }

  return {
    phase,
    feedback,
    hasFeedback,
    refundPercent,
    ...PHASE_COPY[phase],
  }
}

export function canPayerCancel(state: BookingState): boolean {
  return state.payerActions.includes('cancel')
}

export function canRecordFeedback(state: BookingState): boolean {
  return state.phase === 'escrow_held'
}

export function canAdminPayout(state: BookingState): boolean {
  return state.phase === 'awaiting_payout' || state.phase === 'refund_declined'
}

export function canAdminRefund(state: BookingState): boolean {
  return state.phase === 'refund_approved' || state.phase === 'issue_open'
}

/**
 * A success click or the 24-hour window can approve the lister's payout, but it
 * must not mark the money as sent. Only a recorded B2C SMS does that.
 */
export function canAutoApprovePayout(state: BookingState): boolean {
  return (
    state.phase === 'escrow_held' ||
    state.phase === 'awaiting_payout' ||
    state.phase === 'refund_declined'
  )
}

/**
 * The 24-hour close can queue the lister payout while the money is still held.
 * Until Treasury records the B2C SMS, the hunter may still overturn that
 * auto-approval by reporting a real problem.
 */
export function canReportLateAfterAutoApproval(row: WorkflowRow): boolean {
  const feedback = deriveFeedback(row)
  const state = deriveBookingState(row)
  return (
    state.phase === 'awaiting_payout' &&
    (row.release_status || '') === 'held' &&
    feedback?.outcome === 'pleased' &&
    String(feedback.admin_note || '').includes('Auto-approved')
  )
}

export type RefundPlan = {
  allowed: boolean
  percentage: number
  reason: string
  /** True when the admin is recording the refund for an approved issue. */
  fromIssue: boolean
}

/**
 * Single rule set for Treasury refunds.
 *
 * - Money must still be in escrow.
 * - An issue report sets the percentage; an admin cannot quietly refund a
 *   different amount.
 * - A pleased confirmation blocks a refund (the payout queue owns it).
 * - With no report, an admin may still refund (for example a WhatsApp booking
 *   with wrong house data), but only at an explicit percentage.
 */
export function refundPlanForBooking(row: WorkflowRow, requestedPercent?: number): RefundPlan {
  const release = row.release_status || 'pending'
  if (release === 'refunded' || row.refunded_at) {
    return { allowed: false, percentage: 0, reason: 'This booking is already refunded.', fromIssue: false }
  }
  if (release !== 'held') {
    return {
      allowed: false,
      percentage: 0,
      reason: 'Only money held in escrow can be refunded. This booking has no escrow balance.',
      fromIssue: false,
    }
  }

  const feedback = parseBookingFeedback(row.displeased_reason)
  if (feedback?.outcome === 'pleased') {
    return {
      allowed: false,
      percentage: 0,
      reason:
        'The hunter already confirmed a successful viewing, so this booking is in the payout queue. Contact support if a refund is still required.',
      fromIssue: false,
    }
  }

  if (feedback?.outcome === 'issue') {
    if (feedback.decision === 'refund_declined') {
      return {
        allowed: false,
        percentage: 0,
        reason: 'This report was declined. Reopen the report before recording a refund.',
        fromIssue: true,
      }
    }
    return {
      allowed: true,
      percentage: refundPercentForFeedback(feedback),
      reason: 'Refund percentage follows the hunter report category.',
      fromIssue: true,
    }
  }

  const percentage =
    typeof requestedPercent === 'number' && requestedPercent > 0 && requestedPercent <= 100
      ? Math.round(requestedPercent)
      : 80
  return {
    allowed: true,
    percentage,
    reason: 'Admin-initiated refund with no hunter report.',
    fromIssue: false,
  }
}

/** Feedback written when money arrives after the payer cancelled. */
export function latePaymentFeedback(receipt: string, source: string): BookingFeedback {
  return {
    version: 1,
    outcome: 'issue',
    category: 'payment_after_cancellation',
    details: `Payment ${receipt} arrived after the payer cancelled this booking (${source}). A full refund is required; do not reserve or pay out this house.`,
    review: '',
    rating: 0,
    contacted_hunter_at: new Date().toISOString(),
    contacted_lister_at: null,
    admin_note: 'Automatic alert: payment after cancellation.',
    decision: null,
    decided_at: null,
  }
}

export function serializeLatePaymentFeedback(receipt: string, source: string): string {
  return serializeBookingFeedback(latePaymentFeedback(receipt, source))
}
