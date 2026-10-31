import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/security'
import { cached } from '@/lib/server-cache'

type HouseSuggestion = {
  id: string
  title: string
  location: string
  rent: number
  price: number
  house_type: string | null
  image: string | null
}

export async function GET(request: Request) {
  const { allowed } = await withRateLimit(request, 'search')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const raw = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60)
  // PostgREST filters are comma/paren delimited; strip those and wildcards.
  const needle = raw.replace(/[%_,()*]/g, '').trim()

  const payload = await cached(`suggestions:${needle}`, 20_000, async () => {
    try {
      const admin = createAdminClient()

      let housesQuery = admin
        .from('listings')
        .select('id,title,location,rent,price,house_type,images')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(needle ? 6 : 4)

      if (needle) {
        housesQuery = housesQuery.or(
          `title.ilike.*${needle}*,location.ilike.*${needle}*,descriptive_location.ilike.*${needle}*,house_type.ilike.*${needle}*`
        )
      }

      let locationsQuery = admin
        .from('listings')
        .select('location')
        .eq('status', 'published')
        .limit(400)

      if (needle) {
        locationsQuery = locationsQuery.ilike('location', `%${needle}%`)
      }

      const [{ data: houses }, { data: locationRows }] = await Promise.all([housesQuery, locationsQuery])

      type HouseRow = {
        id: string
        title: string
        location: string
        rent: number | null
        price: number | null
        house_type: string | null
        images: string[] | null
      }

      const housesOut: HouseSuggestion[] = ((houses || []) as HouseRow[]).map((house) => ({
        id: house.id,
        title: house.title,
        location: house.location,
        rent: house.rent || 0,
        price: house.price || 0,
        house_type: house.house_type || null,
        image: Array.isArray(house.images) && house.images.length > 0 ? house.images[0] : null,
      }))

      const counts = new Map<string, number>()
      for (const row of locationRows || []) {
        const location = String(row.location || '').trim()
        if (!location) continue
        counts.set(location, (counts.get(location) || 0) + 1)
      }

      const locations = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(([location, count]) => ({ location, count }))

      return { houses: housesOut, locations }
    } catch {
      return { houses: [] as HouseSuggestion[], locations: [] as { location: string; count: number }[] }
    }
  })

  const res = NextResponse.json(payload)
  // Suggestions are public and change slowly; let the CDN reuse them briefly.
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res
}
