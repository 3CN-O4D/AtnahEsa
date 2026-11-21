import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VALIDATION_SCHEMAS, validateRequest, withRateLimit, addSecurityHeaders } from '@/lib/security'
import { invalidateCached } from '@/lib/server-cache'
import { queueSheetNewListing } from '@/lib/sheet-feed'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminSupabase = createAdminClient()

  const { data: listings, error } = await adminSupabase
    .from('listings')
    .select('id, title, price, rent, location, status, images, uploader_id, uploader_name, issues_count, created_at, lister_phone, video_url, youtube_url, tiktok_url, video_urls, youtube_urls, tiktok_urls, taken_by_name')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(listings)
}

/**
 * Admin listing creation goes through the server so the sheet feed is never
 * called from the browser. The admin upload form posts here instead of
 * inserting into Supabase directly.
 */
export async function POST(req: Request) {
  const { allowed, headers } = await withRateLimit(req, 'api')
  if (!allowed) return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers }))

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const { data: profile } = await supabase.from('profiles').select('role, full_name, username').eq('id', user.id).single()
    if (profile?.role !== 'admin') return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))

    const body = await req.json()
    // The admin form calls this field "electricity"; the listings table and
    // the public API call it "electric_bill".
    const validation = validateRequest(VALIDATION_SCHEMAS.listingCreate, {
      ...body,
      electric_bill: body.electric_bill || body.electricity || '',
    })
    if (!validation.success) return addSecurityHeaders(validation.error)

    const data = validation.data
    const admin = createAdminClient()
    const { data: listing, error } = await admin
      .from('listings')
      .insert({
        title: data.title,
        description: data.description,
        price: data.price,
        rent: data.rent,
        deposit: data.deposit || 0,
        deposit_refundable: data.deposit_refundable ?? true,
        electric_bill: data.electric_bill || '',
        water: data.water || '',
        vacancy: data.vacancy || 'vacant',
        why_vacant: data.why_vacant || '',
        house_type: data.house_type || '',
        descriptive_location: data.descriptive_location || '',
        location: data.location,
        images: data.images,
        youtube_url: data.youtube_url || null,
        tiktok_url: data.tiktok_url || null,
        video_urls: data.video_urls || [],
        issues: data.issues || [],
        issues_count: data.issues?.length || 0,
        payment_method: data.payment_method || '',
        lister_phone: data.lister_phone || '',
        status: 'published',
        uploader_id: user.id,
        uploader_name: data.lister_name || profile.full_name || profile.username || 'AseHanta Admin',
      })
      .select('id')
      .single()

    if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 400 }))

    invalidateCached('listings|')
    queueSheetNewListing({
      id: listing.id,
      title: data.title,
      description: data.description,
      price: data.price,
      rent: data.rent,
      deposit: data.deposit || 0,
      location: data.location,
      descriptive_location: data.descriptive_location,
      house_type: data.house_type,
      lister_name: data.lister_name,
      uploader_name: data.lister_name || profile.full_name || profile.username || 'AseHanta Admin',
      lister_phone: data.lister_phone,
      email: user.email ?? '',
      vacancy: data.vacancy,
      event: 'listing_created',
      status: 'published',
    })

    return addSecurityHeaders(NextResponse.json({ success: true, id: listing.id }))
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Internal server error' }, { status: 500 }))
  }
}
