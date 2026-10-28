import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit, addSecurityHeaders } from '@/lib/security'

export async function GET(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'api')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

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

    const response = NextResponse.json({
      houses: listingsRes.count ?? 0,
      bookings: bookingsRes.count ?? 0,
      hunters: huntersRes.count ?? 0,
      listers: listersRes.count ?? 0,
    })
    return addSecurityHeaders(response)
  } catch (err) {
    const response = NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 },
    )
    return addSecurityHeaders(response)
  }
}
