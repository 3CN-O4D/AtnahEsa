import { createAdminClient } from './supabase/admin'
import {
  buildLocationLinks,
  isValidMapPoint,
  type ApproximateListingLocation,
  type ExactListingLocation,
  type ListingCoordinates,
  type MapPoint,
} from './map-types'

type AdminClient = ReturnType<typeof createAdminClient>

export type LocationWriteResult = { ok: true } | { ok: false; error: string }

/** Snapped public circle: enough to see the area, never enough to copy the pin. */
const APPROX_CELL_DEGREES = 0.012 // about 1.3 km at the equator
export const APPROX_RADIUS_METRES = 1200

export function approximatePoint(point: MapPoint): MapPoint {
  return {
    latitude: Number((Math.round(point.latitude / APPROX_CELL_DEGREES) * APPROX_CELL_DEGREES).toFixed(5)),
    longitude: Number((Math.round(point.longitude / APPROX_CELL_DEGREES) * APPROX_CELL_DEGREES).toFixed(5)),
  }
}

export async function saveListingLocation(
  admin: AdminClient,
  listingId: string,
  input: ListingCoordinates
): Promise<LocationWriteResult> {
  if (!isValidMapPoint(input)) return { ok: false, error: 'Valid latitude and longitude are required.' }
  const { error } = await admin
    .from('listing_locations')
    .upsert(
      {
        listing_id: listingId,
        latitude: input.latitude,
        longitude: input.longitude,
        source: input.source || 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'listing_id' }
    )
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function deleteListingLocation(admin: AdminClient, listingId: string): Promise<LocationWriteResult> {
  const { error } = await admin.from('listing_locations').delete().eq('listing_id', listingId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function readListingLocation(admin: AdminClient, listingId: string): Promise<ListingCoordinates | null> {
  const { data } = await admin
    .from('listing_locations')
    .select('latitude, longitude, source')
    .eq('listing_id', listingId)
    .maybeSingle()
  if (!data || !isValidMapPoint(data)) return null
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    source: (data.source as ListingCoordinates['source']) || 'manual',
  }
}

export async function approximateListingLocation(
  admin: AdminClient,
  listingId: string,
  label: string
): Promise<ApproximateListingLocation> {
  const point = await readListingLocation(admin, listingId)
  if (!point) return { hasLocation: false, label }
  return {
    hasLocation: true,
    label,
    center: approximatePoint(point),
    radius: APPROX_RADIUS_METRES,
  }
}

export async function exactListingLocation(
  admin: AdminClient,
  listingId: string,
  label: string
): Promise<ExactListingLocation> {
  const point = await readListingLocation(admin, listingId)
  if (!point) return { hasLocation: false, label }
  return {
    hasLocation: true,
    label,
    location: { latitude: point.latitude, longitude: point.longitude },
    links: buildLocationLinks(point),
  }
}

/** Shared payment gate for listing-scoped map access. */
export async function hasPaidListingBooking(
  admin: AdminClient,
  listingId: string,
  userId: string
): Promise<boolean> {
  const [{ count: paidHouse }, { count: releasedBooking }] = await Promise.all([
    admin
      .from('house_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .in('release_status', ['held', 'paid', 'released', 'refund_requested']),
    admin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .eq('release_status', 'released'),
  ])
  return (paidHouse ?? 0) > 0 || (releasedBooking ?? 0) > 0
}
