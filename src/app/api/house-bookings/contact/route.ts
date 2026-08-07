import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * After a confirmed Tuma payment, collect the hunter's contact details
 * (name / area) so we can link them with the lister. If the user is logged
 * in we also link their account id so "My Bookings" can show the booking.
 */
export async function POST(req: Request) {
  try {
    const { booking_id, name, area, phone } = await req.json()

    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const admin = createAdminClient()

    const { data: booking } = await admin
      .from('house_bookings')
      .select('id, status, user_id')
      .eq('id', booking_id)
      .single()

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = {
      name: name.trim(),
      area: area || '',
    }
    if (phone) update.phone = phone
    if (user?.id && !booking.user_id) update.user_id = user.id

    const { error } = await admin.from('house_bookings').update(update).eq('id', booking_id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, linked: !!user?.id })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
