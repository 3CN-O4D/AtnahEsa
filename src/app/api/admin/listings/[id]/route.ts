import { NextResponse, NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addSecurityHeaders } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { applyAdminListingUpdate } from '@/lib/admin-listing-update'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))

  const body = await req.json()
  const result = await applyAdminListingUpdate(
    createAdminClient(),
    id,
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  )
  if (!result.ok) {
    return addSecurityHeaders(NextResponse.json({ error: result.error || 'Update failed' }, { status: result.status ?? 500 }))
  }
  return addSecurityHeaders(
    NextResponse.json({
      ...((result.data as Record<string, unknown>) ?? {}),
      ...(result.warning ? { warning: result.warning } : {}),
    })
  )
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))

  const admin = createAdminClient()
  const { error } = await admin.from('listings').delete().eq('id', id)
  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }))

  return addSecurityHeaders(NextResponse.json({ success: true }))
}
