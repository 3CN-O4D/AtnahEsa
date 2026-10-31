import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/listings/taken
 *
 * Public list of booked and taken houses. Uses the service role because anon
 * RLS hides `booked` rows. Only non-personal fields are returned and hunter
 * identity is never exposed.
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('listings')
      .select('id, title, location, status, created_at, taken_at')
      .in('status', ['taken', 'booked'])
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Could not load houses' }, { status: 500 })
    }

    return NextResponse.json({ listings: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
