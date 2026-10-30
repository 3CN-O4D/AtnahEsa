import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VALIDATION_SCHEMAS, validateRequest, withRateLimit, addSecurityHeaders } from '@/lib/security'
import { notifyAdmins } from '@/lib/notify'
import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'

/** Columns the public cards actually read. Keeping this list tight makes each
 *  page noticeably smaller over the wire and avoids leaking private fields. */
const PUBLIC_COLUMNS = [
  'id',
  'title',
  'description',
  'price',
  'rent',
  'location',
  'images',
  'issues',
  'issues_count',
  'deposit',
  'deposit_refundable',
  'electricity',
  'electric_bill',
  'water',
  'why_vacant',
  'vacancy',
  'vacancy_type',
  'house_type',
  'building_type',
  'floor_number',
  'descriptive_location',
  'payment_method',
  'status',
  'taken_at',
  'taken_by_name',
  'uploader_id',
  'uploader_name',
  'created_at',
  'updated_at',
].join(',')

/** Public, non-personalised payloads can be reused by the CDN briefly while
 *  still picking up new listings within half a minute. */
function cachedJson(body: unknown) {
  const res = addSecurityHeaders(NextResponse.json(body))
  res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300')
  return res
}

export async function GET(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'search')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const { searchParams } = new URL(req.url)
    const validation = validateRequest(VALIDATION_SCHEMAS.searchQuery, Object.fromEntries(searchParams))
    if (!validation.success) return addSecurityHeaders(validation.error)

    const { query, sort, location, minRent, maxRent, minPrice, maxPrice, issues, page, status, count } = validation.data
    const supabase = createAdminClient()

    const statusFilter = status === 'all' ? ['published', 'taken', 'booked'] : (status ? [status] : ['published', 'taken'])

    const wantCount = count === '1'

    let q = supabase
      .from('listings')
      .select(wantCount ? '*' : PUBLIC_COLUMNS, wantCount ? { count: 'exact', head: true } : undefined)
      .in('status', statusFilter)

    if (!wantCount) {
      const pageNum = Math.max(1, page ? parseInt(page, 10) : 1)
      const from = (pageNum - 1) * ITEMS_PER_PAGE
      q = q.range(from, from + ITEMS_PER_PAGE - 1)
    }

    if (query) {
      const sanitized = query.replace(/[%_]/g, '').slice(0, 100)
      q = q.or(`location.ilike.*${sanitized}*,title.ilike.*${sanitized}*`)
    }
    if (location) q = q.ilike('location', `%${location.replace(/[%_]/g, '').slice(0, 100)}%`)
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

    const { data, error, count: queryCount } = await q

    if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }))

    if (wantCount) {
      return cachedJson({ count: queryCount ?? 0 })
    }

    return cachedJson(data)
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }))
  }
}

export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'api')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const body = await req.json()
    const validation = validateRequest(VALIDATION_SCHEMAS.listingCreate, body)
    if (!validation.success) return addSecurityHeaders(validation.error)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const { data: profile } = await supabase.from('profiles').select('role, username, full_name').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'
    const displayName = profile?.full_name || profile?.username || ''

    const allowedFields = {
      title: validation.data.title,
      description: validation.data.description,
      price: validation.data.price,
      rent: validation.data.rent,
      deposit: validation.data.deposit || 0,
      deposit_refundable: validation.data.deposit_refundable ?? true,
      electric_bill: validation.data.electric_bill || '',
      water: validation.data.water || '',
      vacancy: validation.data.vacancy || 'vacant',
      why_vacant: validation.data.why_vacant || '',
      house_type: validation.data.house_type || '',
      building_type: validation.data.building_type || '',
      floor_number: validation.data.floor_number || '',
      descriptive_location: validation.data.descriptive_location || '',
      location: validation.data.location,
      images: validation.data.images,
      youtube_url: validation.data.youtube_url || null,
      tiktok_url: validation.data.tiktok_url || null,
      video_urls: validation.data.video_urls || [],
      issues: validation.data.issues || [],
      issues_count: validation.data.issues?.length || 0,
      payment_method: validation.data.payment_method || '',
      lister_phone: validation.data.lister_phone || '',
      uploader_id: user.id,
      uploader_name: displayName,
      status: isAdmin ? 'published' : 'pending',
    }

    const { error: insertError } = await supabase.from('listings').insert(allowedFields)
    if (insertError) return addSecurityHeaders(NextResponse.json({ error: insertError.message }, { status: 400 }))

    notifyAdmins('New Listing Uploaded', 'New House Listing', { Title: validation.data.title, Location: validation.data.location, Price: `KES ${validation.data.price}`, Rent: `KES ${validation.data.rent}`, Uploader: user.email ?? 'Unknown' })

    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }))
  }
}
