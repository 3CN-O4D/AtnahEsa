import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const PUBLIC_COLUMNS =
      'id,title,description,price,rent,location,images,youtube_url,video_url,video_urls,youtube_urls,issues,issues_count,deposit,deposit_refundable,electricity,electric_bill,water,why_vacant,vacancy,vacancy_type,house_type,building_type,floor_number,descriptive_location,payment_method,status,taken_at,taken_by_name,uploader_id,created_at,updated_at'

    const { data, error } = await supabase
      .from('listings')
      .select(PUBLIC_COLUMNS)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
