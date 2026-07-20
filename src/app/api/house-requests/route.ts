import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdmins } from '@/lib/notify'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, phone, location, min_rent, max_rent, token_options, water_options, house_designs, description } = body

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !location?.trim()) {
      return NextResponse.json({ error: 'Name, email, phone, and location are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.from('house_requests').insert({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      min_rent: min_rent ? Number(min_rent) : null,
      max_rent: max_rent ? Number(max_rent) : null,
      token_options: token_options || [],
      water_options: water_options || [],
      house_designs: house_designs || [],
      description: description?.trim() || '',
    }).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const tokenLabels: Record<string, string> = { self: 'Self', inclusive: 'Inclusive', either: 'Open to either' }
    const waterLabels: Record<string, string> = { included: 'Included in rent', own_borehole: 'Own borehole', either: 'Open to either' }
    const designLabels: Record<string, string> = {
      bedsitter: 'Bedsitter', studio: 'Studio', '1br': '1 Bedroom', '2br': '2 Bedroom',
      '3br': '3 Bedroom', bungalow: 'Bungalow', apartment: 'Apartment', townhouse: 'Townhouse', other: 'Other',
    }

    notifyAdmins(
      'New House Request',
      '🏠 New House Request',
      {
        Name: name,
        Email: email,
        Phone: phone,
        Location: location,
        'Rent Range': min_rent || max_rent ? `${min_rent ? `KES ${min_rent.toLocaleString()}` : 'Any'} — ${max_rent ? `KES ${max_rent.toLocaleString()}` : 'Any'}` : 'Not specified',
        Token: token_options?.length ? token_options.map((t: string) => tokenLabels[t] || t).join(', ') : 'Not specified',
        Water: water_options?.length ? water_options.map((w: string) => waterLabels[w] || w).join(', ') : 'Not specified',
        'House Design': house_designs?.length ? house_designs.map((d: string) => designLabels[d] || d).join(', ') : 'Not specified',
        Description: description?.trim() || 'None',
        Status: 'Pending',
      }
    )

    return NextResponse.json({ success: true, request: data })
  } catch (err) {
    console.error('House request error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
