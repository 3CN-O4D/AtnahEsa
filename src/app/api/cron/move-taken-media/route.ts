import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { moveMediaToTaken } from '@/lib/move-media'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: stuckListings } = await admin
    .from('listings')
    .select('id')
    .eq('status', 'taken')
    .or('images.cs."{asehanta/listings/}",video_urls.cs."{asehanta/listings/}"')

  let moved = 0
  for (const listing of stuckListings || []) {
    try {
      await moveMediaToTaken(listing.id)
      moved++
    } catch (err) {
      console.error(`Failed to move media for ${listing.id}:`, err)
    }
  }

  return NextResponse.json({ success: true, moved })
}
