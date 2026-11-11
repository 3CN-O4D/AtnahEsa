import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Recent WhatsApp conversations for the admin panel. */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()

  let query = db
    .from('whatsapp_sessions')
    .select('wa_jid, phone, profile_name, ai_enabled, handoff_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (q) {
    const digits = q.replace(/\D/g, '')
    if (digits) query = query.ilike('phone', `%${digits}%`)
    else query = query.ilike('profile_name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('[admin/whatsapp] chats query failed:', error.message)
    return NextResponse.json({ error: 'Could not load chats.' }, { status: 500 })
  }

  return NextResponse.json(
    { chats: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
