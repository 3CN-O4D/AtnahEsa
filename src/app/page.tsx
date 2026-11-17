import HomePageClient, { type HomeStats } from './HomePageClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchGroupedListingsPage, fetchListingGroupCounts } from '@/lib/listings-feed'
import type { Listing } from '@/types'

/**
 * The first screen of homes is rendered on the server so the photos are in the
 * HTML: the browser can start fetching them while the JS still loads, instead
 * of waiting for hydration, an API round trip and then the image request.
 * Later pages keep coming from `/api/listings`.
 *
 * Revalidated in the background so a new listing shows up within a minute.
 */
export const revalidate = 60

const HOME_PAGE_SIZE = 8

export default async function HomePage() {
  let initialListings: Listing[] | undefined
  let initialStats: HomeStats | undefined

  try {
    const supabase = createAdminClient()
    const counts = await fetchListingGroupCounts(supabase)
    initialStats = {
      available: counts.published,
      total: counts.published + counts.booked + counts.taken,
      pending: 0,
      taken: counts.taken + counts.booked,
    }
    initialListings = await fetchGroupedListingsPage(
      supabase,
      { page: 1, pageSize: HOME_PAGE_SIZE },
      counts
    )
  } catch (error) {
    // Supabase being slow or unreachable must never blank the homepage: the
    // client grid and hero stats fall back to fetching after mount.
    console.error('[home] server feed failed, falling back to client fetch', error)
  }

  return <HomePageClient initialListings={initialListings} initialStats={initialStats} />
}
