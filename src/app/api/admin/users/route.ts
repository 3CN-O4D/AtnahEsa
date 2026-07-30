import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { userId, role, verified } = await req.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const adminSupabase = createAdminClient()
    const updates: Record<string, unknown> = {}

    if (role) {
      if (!['hunter', 'lister', 'admin'].includes(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      updates.role = role
      const { error: authError } = await adminSupabase.auth.admin.updateUserById(userId, {
        user_metadata: { role },
      })
      if (authError) console.error('Failed to sync auth metadata:', authError)
    }

    if (verified !== undefined) {
      updates.verified = verified
    }

    if (Object.keys(updates).length > 0) {
      const { error: profileError } = await adminSupabase.from('profiles').update(updates).eq('id', userId)
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('admin/users PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
