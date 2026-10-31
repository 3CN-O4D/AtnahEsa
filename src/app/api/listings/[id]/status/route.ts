import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateCached } from '@/lib/server-cache'

const LISTER_STATUSES = ['published', 'booked', 'taken'] as const
type ListerStatus = (typeof LISTER_STATUSES)[number]

/**
 * A lister may change the availability of their own listing:
 *   published = available, booked = reserved, taken = no longer available.
 *
 * A listing with money in escrow (held) or a completed payout (paid) can only
 * be put back by an admin, so a lister cannot reopen a house that a hunter has
 * already paid for.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const status = body.status as ListerStatus | undefined

    if (!status || !LISTER_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'Status must be available (published), booked, or taken' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to change this listing' }, { status: 401 })

    const admin = createAdminClient()
    const { data: listing } = await admin
      .from('listings')
      .select('id, uploader_id, title, status')
      .eq('id', id)
      .maybeSingle()

    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin'
    const isOwner = listing.uploader_id === user.id

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You can only change your own listings' }, { status: 403 })
    }

    if (!isAdmin && status === 'published' && (listing.status === 'booked' || listing.status === 'taken')) {
      const { data: activeBooking } = await admin
        .from('house_bookings')
        .select('id, release_status')
        .eq('listing_id', id)
        .in('release_status', ['held', 'paid'])
        .limit(1)
        .maybeSingle()

      if (activeBooking) {
        return NextResponse.json(
          {
            error:
              'A hunter has already paid for this house. Contact AseHanta support so an admin can review and put it back if needed.',
          },
          { status: 409 }
        )
      }
    }

    const updates: Record<string, unknown> = { status }
    if (status === 'taken') {
      updates.taken_at = new Date().toISOString()
    } else if (status === 'published') {
      updates.taken_at = null
      updates.taken_by_name = ''
    }

    const { data: updated, error } = await admin
      .from('listings')
      .update(updates)
      .eq('id', id)
      .select('id, status, taken_at')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    invalidateCached('listings|')

    return NextResponse.json({ success: true, listing: updated })
  } catch {
    return NextResponse.json({ error: 'Could not change the listing status' }, { status: 500 })
  }
}
