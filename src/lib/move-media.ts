import { createAdminClient } from '@/lib/supabase/admin'

export async function moveMediaToTaken(listingId: string): Promise<void> {
  const admin = createAdminClient()
  
  // Queue the move operation - actual S3 operations happen via cron
  await admin.from('media_move_queue').insert({
    listing_id: listingId,
    operation: 'move_to_taken',
    status: 'pending',
    created_at: new Date().toISOString(),
  })
}

export async function moveMediaBackToListings(listingId: string): Promise<void> {
  const admin = createAdminClient()
  
  const { data: listing } = await admin
    .from('listings')
    .select('images, video_urls, video_url, taken_at')
    .eq('id', listingId)
    .single()

  if (!listing) throw new Error(`Listing ${listingId} not found`)

  // An admin can put a house back at any time. If the lifecycle cron has
  // already archived the media the queue entry will fail, but the listing
  // status must still be restored.
  await admin.from('media_move_queue').insert({
    listing_id: listingId,
    operation: 'move_back_to_listings',
    status: 'pending',
    created_at: new Date().toISOString(),
  })
}
