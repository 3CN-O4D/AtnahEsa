import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const query = searchParams.get('query') || ''
    const sort = searchParams.get('sort') || ''
    const location = searchParams.get('location') || ''
    const minRent = searchParams.get('minRent') || ''
    const maxRent = searchParams.get('maxRent') || ''
    const minPrice = searchParams.get('minPrice') || ''
    const maxPrice = searchParams.get('maxPrice') || ''
    const issues = searchParams.get('issues') || ''

    const supabase = await createClient()

    let q = supabase
      .from('listings')
      .select('*')
      .eq('status', 'published')
      .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

    if (query) {
      q = q.or(`location.ilike.%${query}%,title.ilike.%${query}%`)
    }
    if (location) q = q.ilike('location', `%${location}%`)
    if (minRent) q = q.gte('rent', parseInt(minRent))
    if (maxRent) q = q.lte('rent', parseInt(maxRent))
    if (minPrice) q = q.gte('price', parseInt(minPrice))
    if (maxPrice) q = q.lte('price', parseInt(maxPrice))
    if (issues) q = q.eq('issues_count', parseInt(issues))

    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      rent_asc: { column: 'rent', ascending: true },
      rent_desc: { column: 'rent', ascending: false },
      price_asc: { column: 'price', ascending: true },
      price_desc: { column: 'price', ascending: false },
      location: { column: 'location', ascending: true },
      issues_asc: { column: 'issues_count', ascending: true },
      issues_desc: { column: 'issues_count', ascending: false },
    }

    if (sort && sortMap[sort]) {
      q = q.order(sortMap[sort].column, { ascending: sortMap[sort].ascending })
    } else {
      q = q.order('created_at', { ascending: false })
    }

    const { data, error } = await q

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { error } = await supabase.from('listings').insert({
      ...body,
      uploader_id: user.id,
      uploader_name: user.email,
      status: 'pending',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
