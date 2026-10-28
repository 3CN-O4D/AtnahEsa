import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()

    const [
      listingsRes,
      bookingsRes,
      huntersRes,
      listersRes,
    ] = await Promise.all([
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'hunter'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'lister'),
    ])

    return NextResponse.json({
      houses: listingsRes.count ?? 0,
      bookings: bookingsRes.count ?? 0,
      hunters: huntersRes.count ?? 0,
      listers: listersRes.count ?? 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 },
    )
  }
}
