import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withRateLimit, addSecurityHeaders, validateRequest, VALIDATION_SCHEMAS } from '@/lib/security'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { allowed, headers } = await withRateLimit(req, 'api')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return addSecurityHeaders(resp)
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    const resp = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return addSecurityHeaders(resp)
  }

  const body = await req.json()
  const validation = validateRequest(VALIDATION_SCHEMAS.listingUpdate, body)
  if (!validation.success) {
    const resp = validation.error
    return addSecurityHeaders(resp)
  }

  const adminSupabase = createAdminClient()

  const { error } = await adminSupabase.from('listings').update(validation.data).eq('id', id)
  if (error) {
    const resp = NextResponse.json({ error: error.message }, { status: 500 })
    return addSecurityHeaders(resp)
  }

  const { data: updated } = await adminSupabase.from('listings').select('*').eq('id', id).single()
  const resp = NextResponse.json(updated)
  return addSecurityHeaders(resp)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { allowed, headers } = await withRateLimit(req, 'api')
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers })
  }

  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const resp = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return addSecurityHeaders(resp)
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    const resp = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return addSecurityHeaders(resp)
  }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase.from('listings').delete().eq('id', id)
  if (error) {
    const resp = NextResponse.json({ error: error.message }, { status: 500 })
    return addSecurityHeaders(resp)
  }

  const resp = NextResponse.json({ success: true })
  return addSecurityHeaders(resp)
}
