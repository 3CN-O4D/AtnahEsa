import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Columns the cards and the favourites page actually render. */
const LISTING_COLUMNS = [
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
  'uploader_id',
  'uploader_name',
  'created_at',
  'updated_at',
].join(',')

async function signedInUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/**
 * GET /api/favorites            -> { ids: string[] }
 * GET /api/favorites?include=listings -> { ids, listings, listers }
 */
export async function GET(request: Request) {
  const { supabase, user } = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: favoriteRows, error } = await supabase
    .from('favorites')
    .select('listing_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (favoriteRows || []).map((row) => row.listing_id as string)
  const include = new URL(request.url).searchParams.get('include')
  if (include !== 'listings' || ids.length === 0) {
    return NextResponse.json({ ids })
  }

  // Reading the listings themselves is public data; the service client keeps
  // booked/taken homes visible in the saved list regardless of row policy.
  const admin = createAdminClient()
  const { data: listings, error: listingsError } = await admin
    .from('listings')
    .select(LISTING_COLUMNS)
    .in('id', ids)

  if (listingsError) {
    return NextResponse.json({ error: listingsError.message }, { status: 500 })
  }

  type ListingRow = { id: string; uploader_id: string; [key: string]: unknown }
  const rows = (listings || []) as unknown as ListingRow[]
  const byId = new Map(rows.map((listing) => [listing.id, listing]))
  const ordered = ids.map((id) => byId.get(id)).filter((listing): listing is ListingRow => Boolean(listing))

  const uploaderIds = [...new Set(ordered.map((listing) => listing.uploader_id).filter(Boolean))]
  const listers: Record<string, { full_name: string | null; role: string | null; verified: boolean }> = {}
  if (uploaderIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles_public')
      .select('id, full_name, role, verified')
      .in('id', uploaderIds)
    for (const profile of profiles || []) {
      listers[profile.id] = {
        full_name: profile.full_name ?? null,
        role: profile.role ?? null,
        verified: !!profile.verified,
      }
    }
  }

  return NextResponse.json({ ids, listings: ordered, listers })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/favorites { listing_id }        -> save one house
 * POST /api/favorites { ids: string[] }     -> merge guest favourites on sign-in
 */
export async function POST(request: Request) {
  const { supabase, user } = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let listingId = ''
  let ids: string[] = []
  try {
    const body = await request.json()
    listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
    if (Array.isArray(body?.ids)) {
      ids = body.ids.filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id))
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (ids.length > 0) {
    const rows = [...new Set(ids)].slice(0, 500).map((id) => ({ user_id: user.id, listing_id: id }))
    const { error } = await supabase
      .from('favorites')
      .upsert(rows, { onConflict: 'user_id,listing_id', ignoreDuplicates: true })

    // Duplicates are harmless on a merge.
    if (error && error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ merged: rows.length })
  }

  if (!listingId || !UUID_RE.test(listingId)) {
    return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('favorites')
    .upsert(
      { user_id: user.id, listing_id: listingId },
      { onConflict: 'user_id,listing_id', ignoreDuplicates: true }
    )

  if (error) {
    // Duplicate saves are harmless — treat them as success.
    if (error.code === '23505') return NextResponse.json({ favorited: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ favorited: true })
}

/** DELETE /api/favorites?listing_id=… */
export async function DELETE(request: Request) {
  const { supabase, user } = await signedInUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const listingId = new URL(request.url).searchParams.get('listing_id')
  if (!listingId) return NextResponse.json({ error: 'listing_id is required' }, { status: 400 })

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ favorited: false })
}
