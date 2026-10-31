import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VALIDATION_SCHEMAS, validateRequest, withRateLimit, addSecurityHeaders } from '@/lib/security'
import { notifyAdmins, notifyUser } from '@/lib/notify'
import { createClient } from '@/lib/supabase/server'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import { getCached, setCached, invalidateCached } from '@/lib/server-cache'
import { createNotification } from '@/lib/notifications'

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
  res.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')
  return res
}

const LISTING_CACHE_TTL_MS = 20_000

export async function GET(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'search')
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })

  try {
    const { searchParams } = new URL(req.url)
    const validation = validateRequest(VALIDATION_SCHEMAS.searchQuery, Object.fromEntries(searchParams))
    if (!validation.success) return addSecurityHeaders(validation.error)

    const { query, sort, location, minRent, maxRent, minPrice, maxPrice, issues, page, limit, status, count } = validation.data
    const supabase = createAdminClient()
    const pageSize = Math.min(48, Math.max(1, limit ? parseInt(limit, 10) : ITEMS_PER_PAGE))

    const cacheKey = [
      'listings',
      status || '',
      count === '1' ? 'count' : 'page',
      page || '1',
      pageSize,
      query || '',
      sort || '',
      location || '',
      minRent || '',
      maxRent || '',
      minPrice || '',
      maxPrice || '',
      issues || '',
    ].join('|')

    const cached = getCached<unknown>(cacheKey)
    if (cached !== undefined) return cachedJson(cached)

    const statusFilter = status === 'all' ? ['published', 'taken', 'booked'] : (status ? [status] : ['published', 'taken'])

    const wantCount = count === '1'

    let q = supabase
      .from('listings')
      .select(wantCount ? '*' : PUBLIC_COLUMNS, wantCount ? { count: 'exact', head: true } : undefined)
      .in('status', statusFilter)

    if (!wantCount) {
      const pageNum = Math.max(1, page ? parseInt(page, 10) : 1)
      const from = (pageNum - 1) * pageSize
      q = q.range(from, from + pageSize - 1)
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
      const payload = { count: queryCount ?? 0 }
      setCached(cacheKey, payload, LISTING_CACHE_TTL_MS)
      return cachedJson(payload)
    }

    setCached(cacheKey, data, LISTING_CACHE_TTL_MS)
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
      request_id: validation.data.request_id || null,
      uploader_id: user.id,
      uploader_name: displayName,
      // A house uploaded against a public request must be visible on the
      // lister's page immediately so the requester can pick it. Admins still
      // get a notification and can unpublish it during review.
      status: isAdmin || validation.data.request_id ? 'published' : 'pending',
    }

    let { error: insertError } = await supabase.from('listings').insert(allowedFields)

    // Tolerate databases where the request-link migration has not run yet.
    if (insertError && /request_id/i.test(`${insertError.code || ''} ${insertError.message || ''}`)) {
      const { request_id: _requestId, ...withoutRequest } = allowedFields
      const retry = await supabase.from('listings').insert(withoutRequest)
      insertError = retry.error
    }

    if (insertError) return addSecurityHeaders(NextResponse.json({ error: insertError.message }, { status: 400 }))

    invalidateCached('listings|')

    const linkedRequestId = validation.data.request_id
    if (linkedRequestId) {
      // Send the requester to this lister's public listings page so they can
      // pick the house themselves. No personal contact details are exchanged.
      try {
        const admin = createAdminClient()
        const { data: houseRequest } = await admin
          .from('house_requests')
          .select('id, name, email, user_id, location, claimed_by')
          .eq('id', linkedRequestId)
          .maybeSingle()

        if (houseRequest) {
          const listingsUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://asehanta.com'}/listers/${user.id}`
          const requesterName = houseRequest.name || 'there'

          await admin
            .from('house_requests')
            .update({ status: 'contacted' })
            .eq('id', linkedRequestId)

          if (houseRequest.user_id) {
            await createNotification({
              userId: houseRequest.user_id,
              category: 'listing',
              title: 'A house matching your request is ready',
              body: `A lister uploaded a house for your request in ${houseRequest.location || 'your area'}. Pick the one you like.`,
              link: `/listers/${user.id}`,
              data: { request_id: linkedRequestId, listing_title: validation.data.title },
            })
          }

          if (houseRequest.email) {
            await notifyUser(
              houseRequest.email,
              'A house for your request is ready',
              `Hi ${requesterName}, a matching house is waiting`,
              {
                Name: requesterName,
                Location: houseRequest.location || 'Your requested area',
                'What Happens Next': 'Open the lister\'s page and pick the house you like. Contact details unlock after a paid booking.',
                'View Houses': listingsUrl,
                'Need Help': `WhatsApp ${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || 'the AseHanta team'} if a listing is unavailable or you need help.`,
              }
            )
          }

          await notifyAdmins('Request House Uploaded', 'House Uploaded for a Request', {
            Request: houseRequest.id,
            Location: houseRequest.location || 'N/A',
            'Listing Title': validation.data.title,
            'Uploaded By': user.email ?? 'Unknown',
            'Requester Page': listingsUrl,
          })
        }
      } catch (err) {
        console.error('Request-linked upload notification failed:', err)
      }
    }

    notifyAdmins('New Listing Uploaded', 'New House Listing', { Title: validation.data.title, Location: validation.data.location, Price: `KES ${validation.data.price}`, Rent: `KES ${validation.data.rent}`, Uploader: user.email ?? 'Unknown' })

    return addSecurityHeaders(NextResponse.json({ success: true }))
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }))
  }
}
