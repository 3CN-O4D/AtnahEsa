import { NextResponse, NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { moveMediaToTaken, moveMediaBackToListings } from '@/lib/move-media'
import { releaseToLister, refundHunter } from '@/lib/escrow'
import { addSecurityHeaders } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'
import { invalidateCached } from '@/lib/server-cache'
import { notifyListerWhatsApp, phoneForUserId } from '@/lib/whatsapp/outbox'

const ALLOWED_UPDATE_FIELDS = new Set([
  'taken_at',
  'taken_by_name',
  'uploader_name',
  'lister_phone',
  'title',
  'description',
  'price',
  'rent',
  'location',
  'descriptive_location',
  'images',
  'youtube_url',
  'youtube_urls',
  'tiktok_url',
  'tiktok_urls',
  'video_urls',
  'video_url',
  'issues',
  'issues_count',
  'payment_method',
  'status',
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return addSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))

  const body = await req.json()
  const { status, ...updates } = body
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key]) => ALLOWED_UPDATE_FIELDS.has(key))
  )

  const admin = createAdminClient()
  const { data: existing } = await admin.from('listings').select('*').eq('id', id).single()
  if (!existing) return addSecurityHeaders(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  // Handle status transitions with media management
  if (status && status !== existing.status) {
    // Booked/Taken -> Published (admin puts the house back on the market)
    if ((existing.status === 'taken' || existing.status === 'booked') && status === 'published') {
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

  const statusDefaults =
    status === 'published'
      ? { taken_at: null, taken_by_name: '' }
      : status === 'taken'
        ? { taken_at: safeUpdates.taken_at || new Date().toISOString() }
        : {}

  const { error } = await admin
    .from('listings')
    .update({ ...statusDefaults, ...safeUpdates, status: status || existing.status })
    .eq('id', id)
  if (error) return addSecurityHeaders(NextResponse.json({ error: error.message }, { status: 500 }))

  invalidateCached('listings|')

  const { data: updated } = await admin.from('listings').select('*').eq('id', id).single()

  // When an admin publishes a house, confirm on WhatsApp to the lister so
  // they know it went live (most useful for pending -> published transitions).
  if (status === 'published' && existing.status !== 'published') {
    try {
      const listerPhone =
        (typeof safeUpdates.lister_phone === 'string' && safeUpdates.lister_phone) ||
        existing.lister_phone ||
        (await phoneForUserId(existing.uploader_id))
      if (listerPhone) {
        await notifyListerWhatsApp(
          listerPhone,
          'Your House is Live',
          'Your listing is now published',
          {
            Title: existing.title,
            Location: existing.location,
            Price: `KES ${existing.price}`,
            Rent: `KES ${existing.rent}`,
            Status: 'Published — live on AseHanta',
          }
        )
      }
    } catch (err) {
      console.error('Lister publish WhatsApp notification failed:', err)
    }
  }

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
