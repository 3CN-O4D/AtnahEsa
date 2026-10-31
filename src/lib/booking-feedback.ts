/**
 * Structured hunter feedback for a paid house viewing.
 *
 * `house_bookings` has no metadata/JSON column, so the structured record is
 * serialised into the existing `displeased_reason` text column. Older rows may
 * still hold a plain string; `parseBookingFeedback` keeps those readable.
 */

export type BookingOutcome = 'pleased' | 'issue'

export const ISSUE_CATEGORIES = [
  {
    id: 'not_as_advertised',
    label: 'House not as advertised',
    description: 'Different house, missing amenities, or the photos did not match.',
    refundPercent: 85,
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
    refundPercent: 85,
    action: 'displeased',
  },
  {
    id: 'changed_mind',
    label: 'I changed my mind',
    description: 'The viewing happened but you decided not to take the house.',
    refundPercent: 85,
    action: 'displeased',
  },
  {
    id: 'other',
    label: 'Something else',
    description: 'Tell us in your own words and an admin will review it.',
    refundPercent: 85,
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
}

export const PLEASED_TERMS =
  'By confirming, you tell AseHanta the viewing happened and the house matched the listing. An admin checks the booking before the lister\u2019s 50% share is released. Your rating and review are saved to the lister\u2019s profile.'

export const ISSUE_TERMS =
  'AseHanta reviews every report before money moves. An admin will contact you and the lister, then decide. A fake listing or a no-show can qualify for a 100% refund; other issues can qualify for 85% once reviewed. The lister is not paid while a report is open.'

export function getIssueCategory(id: string | null | undefined) {
  return ISSUE_CATEGORIES.find((category) => category.id === id) || ISSUE_CATEGORIES[ISSUE_CATEGORIES.length - 1]
}

export function parseBookingFeedback(raw: string | null | undefined): BookingFeedback | null {
  if (!raw) return null
  const text = String(raw).trim()
  if (!text) return null

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Partial<BookingFeedback>
      if (parsed && typeof parsed === 'object' && (parsed.outcome === 'pleased' || parsed.outcome === 'issue')) {
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
        }
      }
    } catch {
      // Fall through to the legacy plain-text format.
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

export function serializeBookingFeedback(feedback: BookingFeedback): string {
  return JSON.stringify(feedback)
}

/** Percentage of the booking fee refundable for an issue category. */
export function refundPercentForFeedback(feedback: BookingFeedback | null): number {
  if (!feedback || feedback.outcome !== 'issue') return 0
  return getIssueCategory(feedback.category).refundPercent
}
