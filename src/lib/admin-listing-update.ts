import { createAdminClient } from './supabase/admin'
import { moveMediaToTaken, moveMediaBackToListings } from './move-media'
import { invalidateCached } from './server-cache'
import { queueSheetEvent } from './sheet-feed'
import { notifyListerWhatsApp, phoneForUserId } from './whatsapp/outbox'
import { deleteListingLocation, saveListingLocation } from './listing-location'
import { isValidMapPoint, type MapCoordinateSource } from './map-types'

type AdminClient = ReturnType<typeof createAdminClient>

/** Fields an admin (or an admin payment record) may change on a listing. */
export const ADMIN_LISTING_UPDATE_FIELDS = new Set([
  'taken_at',
  'taken_by_name',
  'uploader_name',
  'lister_phone',
  'title',
  'description',
  'price',
  'rent',
  'location',
  'descriptive_location',
  'images',
  'youtube_url',
  'youtube_urls',
  'tiktok_url',
  'tiktok_urls',
  'video_urls',
  'video_url',
  'issues',
  'issues_count',
  'payment_method',
  'status',
])

export interface AdminListingUpdateResult {
  ok: boolean
  data?: unknown
  error?: string
  status?: number
  warning?: string
}

/**
 * Shared listing mutation used by the admin editor and by treasury payments
 * recorded in the field. Keeping media moves, cache invalidation, sheet events
 * and lister notifications here means a house updated from either place behaves
 * exactly the same way.
 */
export async function applyAdminListingUpdate(
  admin: AdminClient,
  id: string,
  body: Record<string, unknown>
): Promise<AdminListingUpdateResult> {
  const status = typeof body.status === 'string' ? body.status : null
  const safeUpdates: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([key, value]) => key !== 'status' && ADMIN_LISTING_UPDATE_FIELDS.has(key) && value !== undefined)
  )

  const { data: existing, error: fetchError } = await admin
    .from('listings')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchError || !existing) {
    return { ok: false, error: 'Listing not found', status: 404 }
  }

  // Handle status transitions with media management.
  if (status && status !== existing.status) {
    if ((existing.status === 'taken' || existing.status === 'booked') && status === 'published') {
      try {
        await moveMediaBackToListings(id)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Reversal failed', status: 400 }
      }
    }
    if (existing.status === 'published' && status === 'taken') {
      await moveMediaToTaken(id)
    }
  }

  const statusDefaults: Record<string, unknown> =
    status === 'published'
      ? { taken_at: null, taken_by_name: '' }
      : status === 'taken'
        ? { taken_at: safeUpdates.taken_at || new Date().toISOString() }
        : {}

  const { error } = await admin
    .from('listings')
    .update({ ...statusDefaults, ...safeUpdates, ...(status ? { status } : {}) })
    .eq('id', id)
  if (error) return { ok: false, error: error.message, status: 500 }

  // Coordinates live in the private location table, never on the public
  // listings row. Blank/null means "clear the pin"; a valid pair moves it.
  let locationWarning: string | undefined
  if (body.latitude !== undefined || body.longitude !== undefined) {
    const latitude = body.latitude === '' || body.latitude == null ? null : Number(body.latitude)
    const longitude = body.longitude === '' || body.longitude == null ? null : Number(body.longitude)
    if (latitude === null && longitude === null) {
      const cleared = await deleteListingLocation(admin, id)
      if (!cleared.ok) locationWarning = `Listing updated but the map pin could not be cleared: ${cleared.error}`
    } else {
      const point = { latitude: latitude as number, longitude: longitude as number }
      if (!isValidMapPoint(point)) {
        return { ok: false, error: 'Valid latitude and longitude are required.', status: 400 }
      }
      const candidate = String(body.map_source || 'manual')
      const source: MapCoordinateSource = ['manual', 'current', 'map'].includes(candidate)
        ? (candidate as MapCoordinateSource)
        : 'manual'
      const saved = await saveListingLocation(admin, id, { ...point, source })
      if (!saved.ok) locationWarning = `Listing updated but the map pin failed: ${saved.error}`
    }
  }

  invalidateCached('listings|')

  if (status && status !== existing.status) {
    await queueSheetEvent(id, 'listing_status_changed', {
      status,
      notes: `Status changed from ${existing.status} to ${status}`,
    })
  }

  const { data: updated } = await admin.from('listings').select('*').eq('id', id).single()

  // Confirm on WhatsApp when a house goes live, whether the admin used the
  // listing editor or recorded an off-website payment in the field.
  if (status === 'published' && existing.status !== 'published') {
    try {
      const listerPhone =
        (typeof safeUpdates.lister_phone === 'string' && safeUpdates.lister_phone) ||
        existing.lister_phone ||
        (await phoneForUserId(existing.uploader_id))
      if (listerPhone) {
        await notifyListerWhatsApp(
          listerPhone,
          'Your House is Live',
          'Your listing is now published',
          {
            Title: existing.title,
            Location: existing.location,
            Price: `KES ${existing.price}`,
            Rent: `KES ${existing.rent}`,
            Status: 'Published — live on AseHanta',
          }
        )
      }
    } catch (err) {
      console.error('Lister publish WhatsApp notification failed:', err)
    }
  }

  return { ok: true, data: updated, ...(locationWarning ? { warning: locationWarning } : {}) }
}
