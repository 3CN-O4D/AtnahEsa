import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { package_id, package_name, package_speed, package_price, name, phone, area, id_number } = await req.json()

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

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
