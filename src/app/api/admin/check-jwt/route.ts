import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single()

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    profile_role: profile?.role,
    jwt_role: user.user_metadata?.role,
    jwt_metadata: user.user_metadata,
  })
}
