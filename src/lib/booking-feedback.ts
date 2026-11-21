/**
 * Structured hunter feedback for a paid house viewing.
 *
 * `house_bookings` has no metadata/JSON column, so the structured record is
 * serialised into the existing `displeased_reason` text column. Older rows may
 * still hold a plain string; `parseBookingFeedback` keeps those readable.
 */

export type BookingOutcome = 'pleased' | 'issue'

/**
 * The listing owner can also confirm a viewing or flag a problem. This is
 * informational only: it never moves money. It is stored inside the same
 * serialized record as the hunter's feedback so no new DB column is needed.
 */
export type ListerFeedbackOutcome = 'viewing_confirmed' | 'issue'

export type ListerFeedback = {
  outcome: ListerFeedbackOutcome
  details: string
  submitted_at: string
}

export const ISSUE_CATEGORIES = [
  {
    id: 'not_as_advertised',
    label: 'House not as advertised',
    description: 'Different house, missing amenities, or the photos did not match.',
    refundPercent: 80,
    action: 'displeased',
  },
  {
    id: 'lister_no_show',
    label: 'Lister did not show up',
    description: 'You waited but the lister never arrived or stopped responding.',
    refundPercent: 100,
    action: 'fake_no_show',
  },
  {
    id: 'fake_listing',
    label: 'Fake or already taken',
    description: 'The listing does not exist, was already rented, or looks like a scam.',
    refundPercent: 100,
    action: 'fake_no_show',
  },
  {
    id: 'extra_charges',
    label: 'Lister asked for more money',
    description: 'The lister demanded extra cash outside the AseHanta booking fee.',
    refundPercent: 80,
    action: 'displeased',
  },
  {
    id: 'changed_mind',
    label: 'I changed my mind',
    description: 'The viewing happened but you decided not to take the house.',
    refundPercent: 80,
    action: 'displeased',
  },
  {
    id: 'shared_fault',
    label: 'Shared blame',
    description: 'Both you and the lister contributed to the problem being reviewed.',
    refundPercent: 50,
    action: 'displeased',
  },
  {
    id: 'payment_after_cancellation',
    label: 'Paid after cancelling',
    description: 'Payment arrived after the payer cancelled the viewing. A full refund is required.',
    refundPercent: 100,
    action: 'fake_no_show',
  },
  {
    id: 'other',
    label: 'Something else',
    description: 'Tell us in your own words and an admin will review it.',
    refundPercent: 80,
    action: 'displeased',
  },
] as const

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]['id']

export type BookingFeedback = {
  version: 1
  outcome: BookingOutcome
  category: IssueCategory | 'pleased'
  details: string
  review: string
  rating: number
  contacted_hunter_at?: string | null
  contacted_lister_at?: string | null
  admin_note?: string
  decision?: 'refund_approved' | 'refund_declined' | null
  decided_at?: string | null
  lister_feedback?: ListerFeedback | null
}

type FeedbackRecord = Partial<BookingFeedback> & { version?: number }

function isListerFeedback(value: unknown): value is ListerFeedback {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ListerFeedback>
  return (
    (item.outcome === 'viewing_confirmed' || item.outcome === 'issue') &&
    typeof item.details === 'string' &&
    typeof item.submitted_at === 'string'
  )
}

function readFeedbackRecord(raw: string | null | undefined): FeedbackRecord | null {
  const text = String(raw ?? '').trim()
  if (!text.startsWith('{')) return null
  try {
    const parsed = JSON.parse(text) as FeedbackRecord
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export const PLEASED_TERMS =
  'By confirming, you tell AseHanta the viewing happened and the house matched the listing. The viewing closes and the lister\u2019s 50% payout is approved; an admin sends it by M-Pesa and records the SMS. Your rating and review are saved to the lister\u2019s profile.'

export const ISSUE_TERMS =
  'AseHanta reviews every report before money moves. An admin will contact you and the lister, then decide. A fake listing or a no-show can qualify for a 100% refund; other issues can qualify for 80%, and shared blame for 50%, once reviewed. The lister is not paid while a report is open.'

export function getIssueCategory(id: string | null | undefined) {
  return (
    ISSUE_CATEGORIES.find((category) => category.id === id) ||
    ISSUE_CATEGORIES.find((category) => category.id === 'other') ||
    ISSUE_CATEGORIES[ISSUE_CATEGORIES.length - 1]
  )
}

export function parseBookingFeedback(raw: string | null | undefined): BookingFeedback | null {
  if (!raw) return null
  const text = String(raw).trim()
  if (!text) return null

  if (text.startsWith('{')) {
    const parsed = readFeedbackRecord(text)
    if (!parsed) return null
    if (parsed.outcome !== 'pleased' && parsed.outcome !== 'issue') {
      // A lister-only record is not hunter feedback and must not change the
      // escrow phase.
      return null
    }
    return {
      version: 1,
      outcome: parsed.outcome,
      category: (parsed.category as BookingFeedback['category']) || (parsed.outcome === 'pleased' ? 'pleased' : 'other'),
      details: typeof parsed.details === 'string' ? parsed.details : '',
      review: typeof parsed.review === 'string' ? parsed.review : '',
      rating: typeof parsed.rating === 'number' ? parsed.rating : 0,
      contacted_hunter_at: parsed.contacted_hunter_at || null,
      contacted_lister_at: parsed.contacted_lister_at || null,
      admin_note: typeof parsed.admin_note === 'string' ? parsed.admin_note : '',
      decision: parsed.decision || null,
      decided_at: parsed.decided_at || null,
      lister_feedback: isListerFeedback(parsed.lister_feedback) ? parsed.lister_feedback : null,
    }
  }

  if (text.startsWith('fake_no_show:')) {
    return {
      version: 1,
      outcome: 'issue',
      category: 'fake_listing',
      details: text.slice('fake_no_show:'.length).trim(),
      review: '',
      rating: 0,
    }
  }

  return {
    version: 1,
    outcome: 'issue',
    category: 'other',
    details: text,
    review: '',
    rating: 0,
  }
}

export function serializeBookingFeedback(feedback: BookingFeedback, existingRaw?: string | null): string {
  const existing = existingRaw ? readFeedbackRecord(existingRaw) : null
  const listerFeedback = feedback.lister_feedback ?? existing?.lister_feedback ?? null
  return JSON.stringify({
    ...(existing || {}),
    ...feedback,
    version: 1,
    lister_feedback: listerFeedback,
  })
}

/** Read only the listing owner's feedback, never the hunter's. */
export function parseListerFeedback(raw: string | null | undefined): ListerFeedback | null {
  const record = readFeedbackRecord(raw)
  return record && isListerFeedback(record.lister_feedback) ? record.lister_feedback : null
}

/** Store the listing owner's feedback without overwriting the hunter's record. */
export function withListerFeedback(raw: string | null | undefined, listerFeedback: ListerFeedback): string {
  const text = String(raw ?? '').trim()
  let record: FeedbackRecord = readFeedbackRecord(text) || {}
  if (text && !text.startsWith('{')) {
    // Preserve a legacy plain-text complaint as the hunter's issue details.
    record = {
      version: 1,
      outcome: 'issue',
      category: 'other',
      details: text,
      review: '',
      rating: 0,
    }
  }
  return JSON.stringify({
    ...record,
    version: 1,
    lister_feedback: listerFeedback,
  })
}

/** Percentage of the booking fee refundable for an issue category. */
export function refundPercentForFeedback(feedback: BookingFeedback | null): number {
  if (!feedback || feedback.outcome !== 'issue') return 0
  return getIssueCategory(feedback.category).refundPercent
}
