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

  const takenAt = new Date(listing.taken_at).getTime()
  const hoursSinceTaken = (Date.now() - takenAt) / (1000 * 60 * 60)
  
  if (hoursSinceTaken > 48) {
    throw new Error('48-hour reversal window expired - media already deleted by lifecycle')
  }

  // Queue the reversal operation
  await admin.from('media_move_queue').insert({
    listing_id: listingId,
    operation: 'move_back_to_listings',
    status: 'pending',
    created_at: new Date().toISOString(),
  })
}
