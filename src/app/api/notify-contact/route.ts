import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/notify'

export async function POST(req: NextRequest) {
  try {
    const { booking_id } = await req.json()
    if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

    const supabase = createAdminClient()

    const { data: booking } = await supabase.from('bookings').select('*, listings!inner(*), profiles!inner(*)').eq('id', booking_id).single()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const listing = booking.listings
    const hunterId = booking.user_id
    const listerId = listing.uploader_id

    const { data: listerProfile } = await supabase.from('profiles').select('phone, email, full_name, username').eq('id', listerId).single()
    const { data: hunterProfile } = await supabase.from('profiles').select('phone, email, full_name, username').eq('id', hunterId).single()

    if (!listerProfile || !hunterProfile) return NextResponse.json({ error: 'Profiles not found' }, { status: 404 })

    if (hunterProfile.email) {
      await notifyUser(hunterProfile.email, 'Contact Details Released',
        `You can now contact the lister of "${listing.title}"`,
        { Lister: listerProfile.full_name || listerProfile.username || 'Lister', Phone: listerProfile.phone || 'N/A', Email: listerProfile.email || 'N/A' }
      )
    }

    if (listerProfile.email) {
      await notifyUser(listerProfile.email, 'Tenant Contact Details Released',
        `A tenant has released funds and their contact details are now available for "${listing.title}"`,
        { Tenant: hunterProfile.full_name || hunterProfile.username || 'Tenant', Phone: hunterProfile.phone || 'N/A', Email: hunterProfile.email || 'N/A' }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('notify-contact error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
