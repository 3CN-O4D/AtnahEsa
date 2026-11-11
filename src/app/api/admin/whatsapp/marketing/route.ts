import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'
import { generateMarketingDraft } from '@/lib/whatsapp/marketing'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

/**
 * WhatsApp marketing queue.
 *
 * GET   — drafts/posts, newest first.
 * POST  — ask the AI for a new draft, or save a hand-written one.
 * PATCH — approve, skip, retry, edit, or approve-and-send now.
 *
 * The worker only sends rows whose status is `approved` and whose
 * `scheduled_for` has passed. Approving here is therefore enough; the worker
 * picks it up on its next tick.
 */
export async function GET(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db } = auth.context

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const channel = url.searchParams.get('channel')

  let query = db
    .from('whatsapp_marketing')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)
  if (channel) query = query.eq('channel', channel)

  const { data, error } = await query
  if (error) {
    console.error('[admin/whatsapp] marketing query failed:', error.message)
    return NextResponse.json({ error: 'Could not load marketing.' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const channel = body.channel === 'group' ? 'group' : body.channel === 'status' ? 'status' : null
  if (!channel) return NextResponse.json({ error: 'channel must be status or group' }, { status: 400 })

  const targetJid = typeof body.target_jid === 'string' ? body.target_jid : null
  if (channel === 'group' && !targetJid) {
    return NextResponse.json({ error: 'Choose a group first.' }, { status: 400 })
  }

  if (body.action === 'create' && typeof body.body === 'string' && body.body.trim()) {
    const { data: control } = await db
      .from('whatsapp_bot_control')
      .select('require_approval')
      .eq('id', 1)
      .maybeSingle()

    const { data, error } = await db
      .from('whatsapp_marketing')
      .insert({
        channel,
        target_jid: targetJid,
        body: body.body.trim().slice(0, 3000),
        image_url: typeof body.image_url === 'string' ? body.image_url : null,
        listing_id: typeof body.listing_id === 'string' ? body.listing_id : null,
        template: 'manual',
        status: control?.require_approval === false ? 'approved' : 'draft',
        scheduled_for: new Date().toISOString(),
        created_by: email,
        meta: { source: 'manual', topic: body.topic ?? 'manual' },
      })
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('[admin/whatsapp] manual draft failed:', error.message)
      return NextResponse.json({ error: 'Could not save the draft.' }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  }

  try {
    const draft = await generateMarketingDraft({
      channel,
      target_jid: targetJid,
      topic: typeof body.topic === 'string' ? body.topic : 'auto',
      auto: false,
      created_by: email,
    })
    return NextResponse.json({ item: draft })
  } catch (error) {
    console.error('[admin/whatsapp] draft generation failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Could not generate a draft.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const action = typeof body.action === 'string' ? body.action : 'approve'
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }

  if (action === 'approve' || action === 'send') {
    patch.status = 'approved'
    patch.scheduled_for = typeof body.scheduled_for === 'string' ? body.scheduled_for : now
    patch.approved_by = email
    patch.error = null
  } else if (action === 'skip') {
    patch.status = 'skipped'
    patch.approved_by = email
  } else if (action === 'retry') {
    patch.status = 'approved'
    patch.scheduled_for = now
    patch.error = null
    patch.approved_by = email
  } else if (action === 'update') {
    if (typeof body.body === 'string' && body.body.trim()) patch.body = body.body.trim().slice(0, 3000)
    if (typeof body.image_url === 'string') patch.image_url = body.image_url
    if (typeof body.target_jid === 'string') patch.target_jid = body.target_jid
    if (body.meta && typeof body.meta === 'object') patch.meta = body.meta
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { data, error } = await db
    .from('whatsapp_marketing')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[admin/whatsapp] marketing update failed:', error.message)
    return NextResponse.json({ error: 'Could not update that post.' }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}
