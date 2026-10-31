import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Columns the lister page renders. Never includes lister_phone. */
const LISTER_LISTING_COLUMNS = [
  'id',
  'title',
  'location',
  'rent',
  'price',
  'images',
  'status',
  'taken_at',
  'uploader_id',
  'uploader_name',
  'created_at',
].join(',')

/**
 * GET /api/listers/[id]/listings
 *
 * Returns the public houses for one lister. The service role is used because
 * the anon RLS policy hides `booked` rows, and a paid house must stay visible
 * on the lister's profile. Private fields are never selected.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const [activeRes, closedRes] = await Promise.all([
      admin
        .from('listings')
        .select(LISTER_LISTING_COLUMNS)
        .eq('uploader_id', id)
        .eq('status', 'published')
        .order('created_at', { ascending: false }),
      admin
        .from('listings')
        .select(LISTER_LISTING_COLUMNS)
        .eq('uploader_id', id)
        .in('status', ['taken', 'booked'])
        .order('created_at', { ascending: false }),
    ])

    if (activeRes.error || closedRes.error) {
      return NextResponse.json({ error: 'Could not load listings' }, { status: 500 })
    }

    return NextResponse.json({
      listings: activeRes.data ?? [],
      taken: closedRes.data ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
