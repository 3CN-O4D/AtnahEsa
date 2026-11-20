import ListingDetailClient from './ListingDetailClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { SAFE_LISTING_COLUMNS } from '@/lib/listing-detail-cache'
import type { Listing } from '@/types'

/**
 * The listing itself is rendered on the server so the title, description and
 * hero photo are in the first HTML — the text appears before hydration and the
 * photo (a priority `next/image`) starts downloading with the page instead of
 * after the listing fetch. Reviews, the lister profile and similar homes still
 * load client-side in the background.
 *
 * Server-rendered on every request: detail pages must stay fresh for the very
 * listing a visitor is deciding on.
 */
export const dynamic = 'force-dynamic'

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let listing: Listing | null = null
  try {
    // Service role, same statuses and columns as the detail API: published,
    // booked and taken houses only; never exposes lister_phone.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('listings')
      .select(SAFE_LISTING_COLUMNS)
      .eq('id', id)
      .in('status', ['published', 'booked', 'taken'])
      .maybeSingle()
    if (!error && data) listing = data as unknown as Listing
  } catch {
    // Fall through: the client still fetches after mount, so a Supabase blip
    // never 404s a real listing.
  }

  return <ListingDetailClient initialListing={listing} />
}
