import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const { data: listings, error } = await supabase.from('listings').select('id, title, status, uploader_id, created_at').order('created_at', { ascending: false }).limit(20)
  const { count } = await supabase.from('listings').select('*', { count: 'exact', head: true })
  return NextResponse.json({ total: count, listings, error })
}
