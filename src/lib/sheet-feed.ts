import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * One-way feed from AseHanta to the lister Google Sheet.
 *
 * This module is server-only. SHEET_WEBHOOK_URL and SHEET_WEBHOOK_KEY are read
 * from process.env here and never passed to a client component. The sheet is
 * strictly a mirror: a failure here is logged but never changes the user's
 * listing flow.
 */

export const SHEET_UNIT_TYPES = [
  'Single room',
  'Bedsitter',
  'Studio',
  '1 Bedroom',
  '2 Bedroom',
  '3 Bedroom',
  '4 Bedroom',
  'Mabati',
  'BnB',
  'Other',
] as const

export type SheetUnitType = (typeof SHEET_UNIT_TYPES)[number]
export type SheetFeedStatus = 'added' | 'duplicate' | 'updated'

/**
 * Events the sheet understands. Each event posts a full snapshot of the
 * listing, so the Apps Script can upsert one row keyed on websiteListingId.
 */
export type SheetEvent =
  | 'listing_created'
  | 'listing_backfill'
  | 'listing_status_changed'
  | 'booking_paid'
  | 'payout_approved'
  | 'payout_released'
  | 'refund_recorded'
  | 'booking_cancelled'

export interface SheetListingInput {
  /** Permanent listing UUID from the listings table. */
  id: string
  title?: string | null
  description?: string | null
  price?: number | null
  rent?: number | null
  deposit?: number | null
  location?: string | null
  descriptive_location?: string | null
  house_type?: string | null
  lister_name?: string | null
  uploader_name?: string | null
  lister_phone?: string | null
  email?: string | null
  vacancy?: string | null
  date_available?: string | null

  /** Event fields. All are optional so the original listing payload still works. */
  event?: SheetEvent | null
  status?: string | null
  release_status?: string | null
  booking_status?: string | null
  booking_id?: string | null
  amount_paid?: number | null
  payment_receipt?: string | null
  payout_amount?: number | null
  payout_receipt?: string | null
  payout_date?: string | null
  refund_amount?: number | null
  refund_receipt?: string | null
  refund_date?: string | null
  held_until?: string | null
  paid_at?: string | null
  notes?: string | null
}

type SheetPayload = {
  key: string
  websiteListingId: string
  websiteLink: string
  areaName: string
  propertyName: string
  location: string
  mapsLink: string
  landlordName: string
  phone: string
  email: string
  unitType: SheetUnitType
  rent: number
  deposit: number
  dateAvailable: string
  event?: string
  status?: string
  releaseStatus?: string
  bookingStatus?: string
  bookingId?: string
  amountPaid?: number
  paymentReceipt?: string
  payoutAmount?: number
  payoutReceipt?: string
  payoutDate?: string
  refundAmount?: number
  refundReceipt?: string
  refundDate?: string
  heldUntil?: string
  paidAt?: string
  notes?: string
}

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [500, 1500, 3000]

function cleanString(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function wholeNumber(value: unknown): number {
  const number = Number(String(value ?? '').replace(/[,\s]/g, ''))
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function nairobiDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function normalizeDate(value: unknown): string {
  const text = cleanString(value, 20)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return nairobiDate()
}

/** Map the site's free-text house type onto the sheet's closed unit list. */
export function mapUnitType(houseType: unknown, title?: unknown): SheetUnitType {
  const type = cleanString(houseType, 60).toLowerCase()
  const heading = cleanString(title, 120).toLowerCase()

  // "3+ Bedroom (4)" stores the real bedroom count in parentheses.
  const exact = type.match(/bed(?:room)?\s*\((\d+)\)/) || type.match(/\((\d+)\)\s*bed(?:room)?/)
  const bedrooms = exact ? Number(exact[1]) : Number((type.match(/(\d+)\s*\+?\s*(?:bedroom|bed\s*room|br|bed)/) || [])[1] || 0)
  if (bedrooms > 0) {
    if (bedrooms >= 4) return '4 Bedroom'
    return `${bedrooms} Bedroom` as SheetUnitType
  }

  if (/\bfour\b\s*(bedroom|bed)/.test(type)) return '4 Bedroom'
  if (type.includes('bedsitter') || type.includes('bed sitter') || type.includes('studio')) {
    // The upload form combines these; prefer Studio only when it is explicit.
    return type.includes('studio') && !type.includes('bedsitter') ? 'Studio' : 'Bedsitter'
  }
  if (type.includes('mabati')) return 'Mabati'
  if (type.includes('bnb') || type.includes('bed and breakfast')) return 'BnB'
  if (type.includes('single room') || type.includes('single-room')) return 'Single room'
  if (heading.includes('bedsitter') || heading.includes('studio')) return 'Bedsitter'
  return 'Other'
}

function buildPayload(input: SheetListingInput, key: string): SheetPayload {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://asehanta.com').replace(/\/+$/, '')
  const description = cleanString(input.description, 4000)
  const mapsMatch = description.match(/https?:\/\/(?:maps\.google\.com|goo\.gl\/maps|www\.google\.com\/maps)[^\s,)"']+/i)
  const location = cleanString(input.location, 120)

  return {
    key,
    websiteListingId: cleanString(input.id, 60),
    websiteLink: `${siteUrl}/listings/${encodeURIComponent(input.id)}`,
    areaName: location,
    propertyName: cleanString(input.title, 120),
    location: cleanString(input.descriptive_location, 300) || location,
    mapsLink: mapsMatch ? mapsMatch[0] : '',
    landlordName: cleanString(input.lister_name || input.uploader_name, 120),
    phone: cleanString(input.lister_phone, 40),
    email: cleanString(input.email, 160),
    unitType: mapUnitType(input.house_type, input.title),
    // AseHanta stores the booking fee in `price` and monthly rent in `rent`.
    // BnB rent is monthly too, so the same column applies.
    rent: wholeNumber(input.rent) || wholeNumber(input.price),
    deposit: wholeNumber(input.deposit),
    // There is no "available from" column on a listing. A new listing is
    // vacant, so its creation day is the date it becomes available.
    dateAvailable: normalizeDate(input.date_available),
    ...(input.event ? { event: input.event } : {}),
    ...(input.status != null ? { status: cleanString(input.status, 40) } : {}),
    ...(input.release_status != null ? { releaseStatus: cleanString(input.release_status, 40) } : {}),
    ...(input.booking_status != null ? { bookingStatus: cleanString(input.booking_status, 40) } : {}),
    ...(input.booking_id != null ? { bookingId: cleanString(input.booking_id, 60) } : {}),
    ...(input.amount_paid != null ? { amountPaid: wholeNumber(input.amount_paid) } : {}),
    ...(input.payment_receipt != null ? { paymentReceipt: cleanString(input.payment_receipt, 120) } : {}),
    ...(input.payout_amount != null ? { payoutAmount: wholeNumber(input.payout_amount) } : {}),
    ...(input.payout_receipt != null ? { payoutReceipt: cleanString(input.payout_receipt, 120) } : {}),
    ...(input.payout_date != null ? { payoutDate: cleanString(input.payout_date, 40) } : {}),
    ...(input.refund_amount != null ? { refundAmount: wholeNumber(input.refund_amount) } : {}),
    ...(input.refund_receipt != null ? { refundReceipt: cleanString(input.refund_receipt, 120) } : {}),
    ...(input.refund_date != null ? { refundDate: cleanString(input.refund_date, 40) } : {}),
    ...(input.held_until != null ? { heldUntil: cleanString(input.held_until, 40) } : {}),
    ...(input.paid_at != null ? { paidAt: cleanString(input.paid_at, 40) } : {}),
    ...(input.notes != null ? { notes: cleanString(input.notes, 500) } : {}),
  }
}

/** Redact credentials in case a library error echoes the request. */
function redact(message: string, url: string, key: string): string {
  return message
    .split(url)
    .join('[sheet-url]')
    .split(key)
    .join('[sheet-key]')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * POST one new listing to the sheet. Retries up to three times with a delay.
 * Resolves on `added` and `duplicate`; logs and resolves on final failure.
 */
export async function postNewListingToSheet(input: SheetListingInput): Promise<SheetFeedStatus | null> {
  const url = process.env.SHEET_WEBHOOK_URL
  const key = process.env.SHEET_WEBHOOK_KEY

  if (!url || !key) {
    console.warn('[sheet-feed] SHEET_WEBHOOK_URL or SHEET_WEBHOOK_KEY is not set; listing was not mirrored')
    return null
  }
  if (!cleanString(input.id, 60)) {
    console.error('[sheet-feed] Refusing to mirror a listing without a permanent UUID')
    return null
  }

  const payload = buildPayload(input, key)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // Google Apps Script answers with a 302. fetch follows it by default and
      // switches the redirected POST to GET (curl needs -L without -X POST).
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      })
      const text = await response.text()
      let parsed: { ok?: unknown; status?: unknown; error?: unknown }
      try {
        parsed = JSON.parse(text) as typeof parsed
      } catch {
        throw new Error(`Unexpected non-JSON response (HTTP ${response.status})`)
      }

      if (!response.ok || parsed.ok !== true) {
        const reason = cleanString(parsed.error, 200) || `HTTP ${response.status}`
        throw new Error(reason)
      }
      if (parsed.status === 'added' || parsed.status === 'duplicate' || parsed.status === 'updated') {
        return parsed.status
      }
      throw new Error(`Unexpected status: ${cleanString(parsed.status, 60) || 'none'}`)
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : 'unknown error', url, key)
      if (attempt === MAX_ATTEMPTS) {
        console.error(`[sheet-feed] Failed after ${MAX_ATTEMPTS} attempts for listing ${input.id}: ${message}`)
        return null
      }
      console.warn(`[sheet-feed] Attempt ${attempt} failed for listing ${input.id}; retrying: ${message}`)
      await delay(RETRY_DELAYS_MS[attempt - 1])
    }
  }
  return null
}

/**
 * Queue the feed after the response is sent so a slow or failing sheet never
 * blocks the lister. Safe to call from route handlers and server actions.
 */
export function queueSheetNewListing(input: SheetListingInput): void {
  const snapshot = { ...input }
  after(async () => {
    await postNewListingToSheet(snapshot)
  })
}

/** Fields that describe a lifecycle event on an existing listing. */
export type SheetEventData = Omit<SheetListingInput, 'id' | 'event'> & {
  booking_id?: string | null
  release_status?: string | null
  booking_status?: string | null
  amount_paid?: number | null
  payment_receipt?: string | null
  payout_amount?: number | null
  payout_receipt?: string | null
  payout_date?: string | null
  refund_amount?: string | number | null
  refund_receipt?: string | null
  refund_date?: string | null
  held_until?: string | null
  paid_at?: string | null
  notes?: string | null
}

/**
 * Queue a status/payment/release event for a listing. Loads the current
 * listing and booking snapshot so every post is a full row upsert keyed on
 * websiteListingId. Call from a request handler and await it; the network
 * call itself still happens after the response is sent.
 */
export async function queueSheetEvent(
  listingId: string,
  event: SheetEvent,
  data: SheetEventData = {}
): Promise<void> {
  if (!cleanString(listingId, 60)) return
  try {
    const admin = createAdminClient()
    const { data: listing } = await admin
      .from('listings')
      .select('id, title, description, price, rent, deposit, location, descriptive_location, house_type, lister_phone, uploader_name, status, vacancy')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing) {
      console.warn(`[sheet-feed] Listing ${listingId} not found; event ${event} skipped`)
      return
    }

    const { data: booking } = await admin
      .from('house_bookings')
      .select('id, status, release_status, paid_at, held_until, listing_price, mpesa_receipt')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const refundAmount = data.refund_amount == null ? null : wholeNumber(data.refund_amount)

    queueSheetNewListing({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      rent: listing.rent,
      deposit: listing.deposit,
      location: listing.location,
      descriptive_location: listing.descriptive_location,
      house_type: listing.house_type,
      uploader_name: listing.uploader_name,
      lister_phone: listing.lister_phone,
      vacancy: listing.vacancy,
      event,
      status: data.status ?? listing.status,
      release_status: data.release_status ?? booking?.release_status ?? null,
      booking_status: data.booking_status ?? booking?.status ?? null,
      booking_id: data.booking_id ?? booking?.id ?? null,
      amount_paid: data.amount_paid ?? booking?.listing_price ?? null,
      payout_amount: data.payout_amount ?? null,
      payout_receipt: data.payout_receipt ?? null,
      payout_date: data.payout_date ?? null,
      refund_amount: refundAmount,
      refund_receipt: data.refund_receipt ?? null,
      payment_receipt: data.payment_receipt ?? booking?.mpesa_receipt ?? null,
      refund_date: data.refund_date ?? null,
      held_until: data.held_until ?? booking?.held_until ?? null,
      paid_at: data.paid_at ?? booking?.paid_at ?? null,
      notes: data.notes ?? null,
      email: data.email ?? null,
      lister_name: data.lister_name ?? null,
      date_available: data.date_available ?? null,
    })
  } catch (error) {
    console.error(`[sheet-feed] Could not queue ${event} for listing ${listingId}:`, error instanceof Error ? error.message : 'unknown error')
  }
}
