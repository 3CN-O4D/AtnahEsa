import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'
import { approximateListingLocation } from '@/lib/listing-location'

/**
 * Public approximate area for a listing. The service computes a snapped circle
 * from the private pin so the exact coordinates are never sent to browsers
 * before payment.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: listing } = await admin
    .from('listings')
    .select('title, location, status')
    .eq('id', id)
    .in('status', ['published', 'booked', 'taken'])
    .maybeSingle()

  if (!listing) {
    return addSecurityHeaders(NextResponse.json({ error: 'Listing not found' }, { status: 404 }))
  }

  const payload = await approximateListingLocation(admin, id, listing.location || listing.title || 'House location')
  const response = addSecurityHeaders(NextResponse.json(payload))
  response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return response
}
