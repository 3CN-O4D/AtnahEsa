import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data: listings, error } = await admin.from('listings').select('id, title, status, uploader_id, created_at').order('created_at', { ascending: false }).limit(20)
  const { count } = await admin.from('listings').select('*', { count: 'exact', head: true })
  return NextResponse.json({ total: count, listings, error })
}
