/**
 * One-time (and repeatable) backfill of every listing and its latest booking
 * state to the Google Sheet. Safe to re-run: the sheet dedupes/upserts on
 * websiteListingId. Never logs the webhook URL or key.
 *
 * Usage:
 *   npx tsx scripts/backfill-sheet-feed.ts            # all listings
 *   npx tsx scripts/backfill-sheet-feed.ts --dry-run   # build payloads only
 *   npx tsx scripts/backfill-sheet-feed.ts --limit 10  # first 10 listings
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env', 'utf-8').split('\n').reduce<Record<string, string>>((acc, line) => {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return acc
  const i = trimmed.indexOf('=')
  if (i > 0) {
    const key = trimmed.slice(0, i).trim()
    const value = trimmed.slice(i + 1).trim()
    if (key) {
      acc[key] = value
      process.env[key] = value
    }
  }
  return acc
}, {})

const LISTING_COLUMNS =
  'id, title, description, price, rent, deposit, location, descriptive_location, house_type, lister_phone, uploader_name, status, vacancy, created_at'
const BOOKING_COLUMNS =
  'id, listing_id, status, release_status, paid_at, held_until, listing_price, mpesa_receipt, created_at'

type Listing = Record<string, string | number | boolean | null>
type Booking = Record<string, string | number | boolean | null>

async function fetchAll(table: 'listings' | 'house_bookings', columns: string): Promise<Array<Listing | Booking>> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const rows: Array<Listing | Booking> = []
  const pageSize = 500
  let from = 0
  while (true) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...((data ?? []) as unknown as Array<Listing | Booking>))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function text(value: unknown): string | null {
  return value == null ? null : String(value)
}

function number(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  const limitArg = process.argv.indexOf('--limit')
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 0 : 0

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase URL and service role key are required in .env')
  }
  if (!dryRun && (!env.SHEET_WEBHOOK_URL || !env.SHEET_WEBHOOK_KEY)) {
    throw new Error('SHEET_WEBHOOK_URL and SHEET_WEBHOOK_KEY are required in .env')
  }

  const { postNewListingToSheet } = await import('../src/lib/sheet-feed')

  const [listings, bookings] = await Promise.all([
    fetchAll('listings', LISTING_COLUMNS),
    fetchAll('house_bookings', BOOKING_COLUMNS),
  ])

  const latestBooking = new Map<string, Booking>()
  for (const booking of bookings) {
    const listingId = text(booking.listing_id)
    if (listingId && !latestBooking.has(listingId)) latestBooking.set(listingId, booking)
  }

  const targets = limit > 0 ? listings.slice(0, limit) : listings
  const totals = { added: 0, duplicate: 0, updated: 0, failed: 0, skipped: 0 }

  console.log(`Backfilling ${targets.length} of ${listings.length} listings (${bookings.length} bookings loaded)`)

  for (const [index, listing] of targets.entries()) {
    const id = text(listing.id)
    if (!id) {
      totals.skipped += 1
      continue
    }
    const booking = latestBooking.get(id)
    const input = {
      id,
      title: text(listing.title),
      description: text(listing.description),
      price: number(listing.price),
      rent: number(listing.rent),
      deposit: number(listing.deposit),
      location: text(listing.location),
      descriptive_location: text(listing.descriptive_location),
      house_type: text(listing.house_type),
      uploader_name: text(listing.uploader_name),
      lister_phone: text(listing.lister_phone),
      vacancy: text(listing.vacancy),
      event: 'listing_backfill' as const,
      status: text(listing.status),
      booking_id: text(booking?.id),
      booking_status: text(booking?.status),
      release_status: text(booking?.release_status),
      amount_paid: number(booking?.listing_price),
      paid_at: text(booking?.paid_at),
      held_until: text(booking?.held_until),
      payment_receipt: text(booking?.mpesa_receipt),
      notes: `Backfill from AseHanta (status ${text(listing.status) || 'unknown'})`,
    }

    if (dryRun) {
      console.log(`[dry-run ${index + 1}/${targets.length}] ${id} — ${input.status} — ${input.release_status || 'no booking'}`)
      continue
    }

    const result = await postNewListingToSheet(input)
    if (result) totals[result] += 1
    else totals.failed += 1
    console.log(`[${index + 1}/${targets.length}] ${id} — ${result || 'FAILED'}`)

    // Google Apps Script web apps are rate limited; be gentle with a big sheet.
    if (index < targets.length - 1) await new Promise((resolve) => setTimeout(resolve, 250))
  }

  console.log('Backfill complete:', JSON.stringify(totals))
}

run().catch((error) => {
  console.error('Backfill failed:', error instanceof Error ? error.message : 'unknown error')
  process.exit(1)
})
