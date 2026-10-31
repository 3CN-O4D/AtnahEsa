import { createClient } from '@/lib/supabase/client'
import type { Listing } from '@/types'

/**
 * Never select `lister_phone` from public pages. It is unlocked through the
 * payment-gated contact endpoints instead.
 */
export const SAFE_LISTING_COLUMNS =
  'id,title,description,price,rent,location,images,youtube_url,tiktok_url,video_url,video_urls,youtube_urls,tiktok_urls,issues,issues_count,deposit,deposit_refundable,electricity,electric_bill,water,why_vacant,vacancy,vacancy_type,house_type,building_type,floor_number,descriptive_location,payment_method,status,taken_at,uploader_id,uploader_name,created_at,updated_at'

const DETAIL_CACHE_TTL_MS = 5 * 60_000
const MAX_ENTRIES = 40

type CacheEntry = { at: number; listing: Listing; full: boolean }

// Shared between the listing grid (which warms it) and the detail page (which
// paints from it), so a card click never lands on an empty preview.
const detailCache = new Map<string, CacheEntry>()

export function readDetailCache(id: string): Listing | null {
  const hit = detailCache.get(id)
  if (!hit) return null
  if (Date.now() - hit.at > DETAIL_CACHE_TTL_MS) {
    detailCache.delete(id)
    return null
  }
  return hit.listing
}

export function hasDetailCache(id: string): boolean {
  return readDetailCache(id) !== null
}

export function writeDetailCache(listing: Listing, full = true) {
  if (!listing?.id) return
  detailCache.set(listing.id, { at: Date.now(), listing, full })
  // Keep the module cache small in long sessions.
  if (detailCache.size > MAX_ENTRIES) {
    const oldest = detailCache.keys().next().value
    if (oldest) detailCache.delete(oldest)
  }
}

/**
 * Seed the cache from a card payload. Cards already carry almost every field
 * the preview needs, so this lets the detail page paint on the very first
 * frame (mobile taps included, where there is no hover lead time).
 */
export function seedDetailCache(listing: Listing) {
  if (!listing?.id) return
  if (detailCache.has(listing.id)) return
  writeDetailCache(listing, false)
}

/** Fetch the full preview row ahead of navigation (hover/focus/tap). */
export async function prefetchListingDetail(id: string): Promise<void> {
  const hit = detailCache.get(id)
  if (hit?.full && Date.now() - hit.at <= DETAIL_CACHE_TTL_MS) return
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('listings')
      .select(SAFE_LISTING_COLUMNS)
      .eq('id', id)
      .single()
    if (data) writeDetailCache(data as Listing, true)
  } catch {
    // Prefetch is best-effort; the detail page still loads normally.
  }
}

/** Warm several previews without blocking the UI. */
export function prefetchListingDetails(ids: string[]) {
  const missing = ids.filter((id) => id && !hasDetailCache(id))
  if (missing.length === 0) return
  for (const id of missing) void prefetchListingDetail(id)
}
