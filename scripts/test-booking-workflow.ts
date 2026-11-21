import assert from 'node:assert/strict'
import {
  deriveBookingState,
  canPayerCancel,
  canRecordFeedback,
  canAdminPayout,
  canAdminRefund,
  canAutoApprovePayout,
  canReportLateAfterAutoApproval,
  refundPlanForBooking,
} from '../src/lib/booking-workflow'
import { parseBookingFeedback, serializeBookingFeedback, refundPercentForFeedback, type BookingFeedback } from '../src/lib/booking-feedback'

function feedback(outcome: 'pleased' | 'issue', extra: Partial<BookingFeedback> = {}): string {
  return serializeBookingFeedback({
    version: 1,
    outcome,
    category: outcome === 'pleased' ? 'pleased' : 'other',
    details: '',
    review: '',
    rating: outcome === 'pleased' ? 5 : 0,
    contacted_hunter_at: null,
    contacted_lister_at: null,
    admin_note: '',
    decision: null,
    decided_at: null,
    ...extra,
  })
}

const cases: Array<{ name: string; row: Record<string, unknown>; payment?: { status: string }; expect: string; checks: (s: ReturnType<typeof deriveBookingState>) => void }> = [
  {
    name: 'new unpaid booking can be paid or cancelled',
    row: { status: 'pending', release_status: 'pending' },
    expect: 'awaiting_payment',
    checks: (s) => {
      assert.equal(canPayerCancel(s), true)
      assert.equal(canRecordFeedback(s), false)
      assert.deepEqual(s.payerActions, ['pay', 'cancel'])
    },
  },
  {
    name: 'failed payment can be retried or cancelled',
    row: { status: 'pending', release_status: 'pending' },
    payment: { status: 'failed' },
    expect: 'payment_failed',
    checks: (s) => assert.deepEqual(s.payerActions, ['pay', 'cancel']),
  },
  {
    name: 'manual SMS claim cannot pay twice but can cancel',
    row: { status: 'pending', release_status: 'pending', mpesa_message: 'ABC123 Confirmed Ksh10 paid on 20/11/26 at 4:12 PM' },
    payment: { status: 'verifying' },
    expect: 'payment_under_review',
    checks: (s) => {
      assert.equal(s.payerActions.includes('pay'), false)
      assert.equal(canPayerCancel(s), true)
    },
  },
  {
    name: 'successful transaction not yet applied never shows pay button',
    row: { status: 'pending', release_status: 'pending' },
    payment: { status: 'success' },
    expect: 'payment_received_unapplied',
    checks: (s) => assert.equal(s.payerActions.includes('pay'), false),
  },
  {
    name: 'paid escrow shows feedback actions but no cancel',
    row: { status: 'confirmed', release_status: 'held', paid_at: '2026-11-20T12:00:00Z' },
    expect: 'escrow_held',
    checks: (s) => {
      assert.equal(canRecordFeedback(s), true)
      assert.equal(canPayerCancel(s), false)
      assert.deepEqual(s.payerActions, ['confirm_pleased', 'report_issue', 'contact_support'])
    },
  },
  {
    name: 'pleased feedback moves to admin payout queue',
    row: { status: 'confirmed', release_status: 'held', displeased_reason: feedback('pleased'), confirmed_at: '2026-11-20T13:00:00Z' },
    expect: 'awaiting_payout',
    checks: (s) => {
      assert.equal(canAdminPayout(s), true)
      assert.equal(canAdminRefund(s), false)
    },
  },
  {
    name: 'open issue blocks payout',
    row: { status: 'confirmed', release_status: 'held', displeased_reason: feedback('issue', { category: 'not_as_advertised' }) },
    expect: 'issue_open',
    checks: (s) => {
      assert.equal(s.refundPercent, 80)
      assert.equal(canAdminPayout(s), false)
      assert.equal(canAdminRefund(s), true)
    },
  },
  {
    name: 'no-show issue is 100 percent and still blocks payout',
    row: { status: 'confirmed', release_status: 'held', displeased_reason: feedback('issue', { category: 'lister_no_show' }) },
    expect: 'issue_open',
    checks: (s) => assert.equal(s.refundPercent, 100),
  },
  {
    name: 'approved refund waits for SMS proof',
    row: { status: 'confirmed', release_status: 'held', displeased_reason: feedback('issue', { decision: 'refund_approved' }) },
    expect: 'refund_approved',
    checks: (s) => assert.deepEqual(s.adminActions, ['record_refund']),
  },
  {
    name: 'declined refund returns booking to payout queue',
    row: { status: 'confirmed', release_status: 'held', displeased_reason: feedback('issue', { decision: 'refund_declined' }) },
    expect: 'refund_declined',
    checks: (s) => assert.equal(canAdminPayout(s), true),
  },
  {
    name: 'refund completed is terminal',
    row: { status: 'confirmed', release_status: 'refunded', refunded_at: '2026-11-20T14:00:00Z', displeased_reason: feedback('issue', { decision: 'refund_approved' }) },
    expect: 'refunded',
    checks: (s) => assert.deepEqual(s.payerActions, ['view_receipt', 'book_again', 'contact_support']),
  },
  {
    name: 'payout completed is terminal success',
    row: { status: 'confirmed', release_status: 'paid', displeased_reason: feedback('pleased') },
    expect: 'paid',
    checks: (s) => assert.deepEqual(s.payerActions, ['view_receipt', 'book_again', 'contact_support']),
  },
  {
    name: 'payer cancellation is terminal',
    row: { status: 'cancelled', release_status: 'pending' },
    payment: { status: 'verifying' },
    expect: 'cancelled',
    checks: (s) => {
      assert.equal(canPayerCancel(s), false)
      assert.deepEqual(s.payerActions, ['book_again'])
    },
  },
  {
    name: 'payment after cancellation is a full-refund review',
    row: {
      status: 'confirmed',
      release_status: 'held',
      displeased_reason: serializeBookingFeedback({
        version: 1,
        outcome: 'issue',
        category: 'payment_after_cancellation',
        details: 'late payment',
        review: '',
        rating: 0,
      }),
    },
    expect: 'issue_open',
    checks: (s) => {
      assert.equal(s.refundPercent, 100)
      assert.equal(canAdminPayout(s), false)
    },
  },
  {
    name: 'legacy rating plus confirmed_at still counts as pleased feedback',
    row: { status: 'confirmed', release_status: 'held', confirmed_at: '2026-11-20T13:00:00Z', rating: 5 },
    expect: 'awaiting_payout',
    checks: (s) => assert.equal(s.hasFeedback, true),
  },
  {
    name: 'auto-approved 24h close queues payout but keeps money in escrow',
    row: {
      status: 'confirmed',
      release_status: 'held',
      displeased_reason: feedback('pleased', { admin_note: 'Auto-approved: viewing window ended' }),
    },
    expect: 'awaiting_payout',
    checks: (s) => {
      assert.equal(canPayerCancel(s), false)
      assert.equal(canAdminPayout(s), true)
      assert.equal(canAdminRefund(s), false)
    },
  },
]

for (const testCase of cases) {
  const state = deriveBookingState(testCase.row, testCase.payment)
  assert.equal(state.phase, testCase.expect, `${testCase.name}: expected ${testCase.expect}, got ${state.phase}`)
  testCase.checks(state)
  console.log(`✓ ${testCase.name}`)
}

// Serialization round-trip and category coverage.
const raw = serializeBookingFeedback({
  version: 1,
  outcome: 'issue',
  category: 'payment_after_cancellation',
  details: 'receipt ABC',
  review: '',
  rating: 0,
})
assert.equal(parseBookingFeedback(raw)?.category, 'payment_after_cancellation')
assert.equal(refundPercentForFeedback(parseBookingFeedback(raw)), 100)
console.log('✓ feedback serialization round-trip')

// 24-hour auto-close may approve a payout from escrow, but never from an open report.
assert.equal(canAutoApprovePayout(deriveBookingState({ status: 'confirmed', release_status: 'held' })), true)
assert.equal(
  canAutoApprovePayout(
    deriveBookingState({ status: 'confirmed', release_status: 'held', displeased_reason: feedback('issue') })
  ),
  false
)
assert.equal(
  canReportLateAfterAutoApproval({
    status: 'confirmed',
    release_status: 'held',
    displeased_reason: feedback('pleased', { admin_note: 'Auto-approved: 24-hour window' }),
  }),
  true
)
assert.equal(
  canReportLateAfterAutoApproval({
    status: 'confirmed',
    release_status: 'held',
    displeased_reason: feedback('pleased', { admin_note: 'Hunter confirmed success' }),
  }),
  false
)
assert.equal(
  canReportLateAfterAutoApproval({
    status: 'confirmed',
    release_status: 'paid',
    displeased_reason: feedback('pleased', { admin_note: 'Auto-approved: 24-hour window' }),
  }),
  false
)
console.log('✓ auto-close guard')

// Treasury refund rules.
const held = { status: 'confirmed', release_status: 'held' }
assert.deepEqual(refundPlanForBooking(held).percentage, 80)
assert.equal(refundPlanForBooking(held, 100).percentage, 100)
assert.equal(refundPlanForBooking({ ...held, release_status: 'paid' }).allowed, false)
assert.equal(refundPlanForBooking({ ...held, release_status: 'pending' }).allowed, false)
assert.equal(refundPlanForBooking({ ...held, displeased_reason: feedback('pleased') }).allowed, false)
assert.equal(
  refundPlanForBooking({ ...held, displeased_reason: feedback('issue', { category: 'lister_no_show' }) }).percentage,
  100
)
assert.equal(
  refundPlanForBooking({
    ...held,
    displeased_reason: feedback('issue', { category: 'lister_no_show' }),
  }, 50).percentage,
  100
)
assert.equal(
  refundPlanForBooking({ ...held, displeased_reason: feedback('issue', { decision: 'refund_declined' }) }).allowed,
  false
)
console.log('✓ refund plan rules')

console.log(`\n${cases.length + 3} workflow scenarios passed.`)
