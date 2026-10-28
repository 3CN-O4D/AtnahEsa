import { NextResponse, NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { moveMediaToTaken, moveMediaBackToListings } from '@/lib/move-media'
import { releaseToLister, refundHunter } from '@/lib/escrow'
import { addSecurityHeaders } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))

  const body = await req.json()
  const { status, ...updates } = body

  const admin = createAdminClient()
  const { data: existing } = await admin.from('listings').select('*').eq('id', id).single()
  if (!existing) return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  // Handle status transitions with media management
  if (status && status !== existing.status) {
    // Taken -> Published (reversal within 48h)
    if (existing.status === 'taken' && status === 'published') {
      try {
        await moveMediaBackToListings(id)
      } catch (err) {
        return addSecurityHeaders(NextResponse.json({ error: err instanceof Error ? err.message : 'Reversal failed' }, { status: 400 }))
      }
    }
    
    // Published -> Taken
    if (existing.status === 'published' && status === 'taken') {
      await moveMediaToTaken(id)
    }
  }

  const { error } = await admin.from('listings').update({ ...updates, status: status || existing.status }).eq('id', id)
  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }))

  const { data: updated } = await admin.from('listings').select('*').eq('id', id).single()
  return addSecurityHeaders(NextResponse.json(updated))
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
