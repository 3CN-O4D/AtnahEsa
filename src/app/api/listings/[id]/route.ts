import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SAFE_LISTING_COLUMNS } from '@/lib/listing-detail-cache'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use the service role so a booked house stays publicly viewable even
    // though the anon RLS policy only lists published/taken rows. Pending and
    // rejected listings are never exposed here.
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('listings')
      .select(SAFE_LISTING_COLUMNS)
      .eq('id', id)
      .in('status', ['published', 'booked', 'taken'])
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
