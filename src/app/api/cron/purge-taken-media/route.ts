import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteMediaUrl } from '@/lib/media'
import { invalidateCached } from '@/lib/server-cache'

/** Taken houses keep their media for 48 hours, then the objects are deleted
 *  from the bucket to free space. The listing row itself stays. */
const PURGE_AFTER_MS = 48 * 60 * 60 * 1000
const BATCH_SIZE = 50

type ListingMediaRow = {
  id: string
  images: string[] | null
  video_urls: string[] | null
  video_url: string | null
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - PURGE_AFTER_MS).toISOString()

  // Reference counts so a photo shared by another (live) listing is never
  // deleted out from under it.
  const { data: allListings } = await admin
    .from('listings')
    .select('id, images, video_urls, video_url')
    .limit(5000)

  const refCount = new Map<string, number>()
  for (const row of (allListings || []) as ListingMediaRow[]) {
    for (const url of mediaUrls(row)) {
      refCount.set(url, (refCount.get(url) || 0) + 1)
    }
  }

  const { data: dueListings, error } = await admin
    .from('listings')
    .select('id, images, video_urls, video_url')
    .eq('status', 'taken')
    .lt('taken_at', cutoff)
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let purged = 0
  let deleted = 0

  for (const row of (dueListings || []) as ListingMediaRow[]) {
    const urls = mediaUrls(row)
    if (urls.length === 0) continue

    for (const url of urls) {
      // Only the purged listing still points at this object.
      if ((refCount.get(url) || 0) > 1) continue
      const managed = await deleteMediaUrl(url).catch(() => false)
      if (managed) deleted += 1
    }

    const { error: clearError } = await admin
      .from('listings')
      .update({ images: [], video_urls: [], video_url: null })
      .eq('id', row.id)
    if (!clearError) purged += 1
  }

  if (purged > 0) invalidateCached('listings|')

  return NextResponse.json({ success: true, listings_purged: purged, objects_deleted: deleted })
}

function mediaUrls(row: ListingMediaRow): string[] {
  return [...(row.images || []), ...(row.video_urls || []), row.video_url].filter(
    (url): url is string => typeof url === 'string' && url.length > 0
  )
}
