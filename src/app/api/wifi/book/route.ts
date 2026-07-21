import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

export async function POST(req: Request) {
  try {
    const { package_id, package_name, package_speed, package_price, package_provider, package_original_price, package_description, package_features, name, phone, area, id_number } = await req.json()

    if (!name || !phone || !area) {
      return NextResponse.json({ error: 'Name, phone, and area are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('wifi_bookings').insert({
      package_id, package_name, package_speed, package_price,
      name, phone, area, id_number: id_number || '',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const original = package_original_price ? `KES ${package_original_price.toLocaleString()}` : null

    await notifyAdmins(
      'WIFI NEEDED',
      'WiFi Booking Request',
      {
        Name: name,
        Phone: phone,
        Area: area,
        'ID Number': id_number || 'Not provided',
        Package: package_name || 'N/A',
        Provider: package_provider || 'N/A',
        Speed: package_speed || 'N/A',
        Price: package_price ? `KES ${package_price.toLocaleString()}/month` : 'N/A',
        'Original Price': original || 'N/A',
        Discount: original && package_price ? `${Math.round((1 - package_price / package_original_price) * 100)}% off` : 'N/A',
        Description: package_description || 'N/A',
        Features: package_features?.length ? package_features.join(', ') : 'N/A',
      }
    )

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}