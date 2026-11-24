import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS, withRateLimit } from '@/lib/security'
import { deleteListingLocation, exactListingLocation, hasPaidListingBooking, saveListingLocation } from '@/lib/listing-location'
import type { ListingCoordinates } from '@/lib/map-types'

type Context = { params: Promise<{ id: string }> }

function fail(error: string, status: number, headers?: HeadersInit) {
  return addSecurityHeaders(NextResponse.json({ error }, { status, headers }))
}

async function requireOwnerOrAdmin(listingId: string) {
  const cookie = await createClient()
  const {
    data: { user },
  } = await cookie.auth.getUser()
  if (!user) return { error: fail('Unauthorized', 401) } as const

  const admin = createAdminClient()
  const [{ data: profile }, { data: listing }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('listings').select('id, title, location, uploader_id').eq('id', listingId).maybeSingle(),
  ])
  if (!listing) return { error: fail('Listing not found', 404) } as const

  const isAdmin = profile?.role === 'admin'
  const isOwner = listing.uploader_id === user.id
  if (!isAdmin && !isOwner) return { error: fail('Forbidden', 403) } as const

  return { admin, user, listing } as const
}

/** Exact pin for the lister/admin or a hunter with a verified paid booking. */
export async function GET(req: Request, { params }: Context) {
  const { id } = await params
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const cookie = await createClient()
  const {
    data: { user },
  } = await cookie.auth.getUser()
  if (!user) return fail('Sign in to view the exact location', 401)

  const admin = createAdminClient()
  const [{ data: profile }, { data: listing }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('listings').select('id, title, location, uploader_id').eq('id', id).maybeSingle(),
  ])
  if (!listing) return fail('Listing not found', 404)

  const isAdmin = profile?.role === 'admin'
  const isOwner = listing.uploader_id === user.id
  if (!isAdmin && !isOwner) {
    const paid = await hasPaidListingBooking(admin, id, user.id)
    if (!paid) {
      return fail('Exact location unlocks after you pay for this house', 402, rate.headers)
    }
  }

  const payload = await exactListingLocation(admin, id, listing.location || listing.title || 'House location')
  const response = addSecurityHeaders(NextResponse.json(payload))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** Lister/admin save or move the pin. */
export async function PATCH(req: Request, { params }: Context) {
  const { id } = await params
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const access = await requireOwnerOrAdmin(id)
  if ('error' in access) return access.error

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return fail('Invalid request.', 400)
  }
  const validation = validateRequest(VALIDATION_SCHEMAS.listingLocationUpdate, raw)
  if (!validation.success) return addSecurityHeaders(validation.error)
  const body = validation.data as { latitude: number; longitude: number; source?: ListingCoordinates['source'] }

  const saved = await saveListingLocation(access.admin, id, {
    latitude: body.latitude,
    longitude: body.longitude,
    source: body.source || 'manual',
  })
  if (!saved.ok) return fail(saved.error, 500)

  const location = await exactListingLocation(access.admin, id, access.listing.location || access.listing.title || 'House location')
  const response = addSecurityHeaders(NextResponse.json({ success: true, location }))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

/** Lister/admin clear the pin. */
export async function DELETE(req: Request, { params }: Context) {
  const { id } = await params
  const rate = await withRateLimit(req, 'api')
  if (!rate.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rate.headers }))
  }

  const access = await requireOwnerOrAdmin(id)
  if ('error' in access) return access.error

  const removed = await deleteListingLocation(access.admin, id)
  if (!removed.ok) return fail(removed.error, 500)

  return addSecurityHeaders(NextResponse.json({ success: true }))
}
