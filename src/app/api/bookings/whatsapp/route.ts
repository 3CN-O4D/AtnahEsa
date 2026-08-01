import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const { listing_id, listing_title, listing_location, listing_price, name, phone, area, id_number } = await req.json()

    if (!listing_id || !name || !phone || !area) {
      return NextResponse.json({ error: 'Name, phone, and area are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('house_bookings').insert({
      listing_id,
      listing_title: listing_title || '',
      listing_location: listing_location || '',
      listing_price: listing_price || 0,
      name,
      phone,
      area,
      id_number: id_number || '',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await notifyAdmins(
      'New House Booking',
      'WhatsApp House Booking Request',
      {
        Name: name,
        Phone: phone,
        Area: area,
        'ID Number': id_number || 'Not provided',
        House: listing_title || 'N/A',
        Location: listing_location || 'N/A',
        Price: listing_price ? `KES ${listing_price.toLocaleString()}` : 'N/A',
      }
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
