import { NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Clear chats/groups collected by a previous WhatsApp number.
 *
 * This does not touch the pairing session, bot rules or status settings. It is
 * intentionally explicit: the admin must send `{ confirm: 'RESET' }`.
 */
export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { db, email } = auth.context

  let body: { confirm?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  if (body.confirm !== 'RESET') {
    return NextResponse.json({ error: 'Send confirm: "RESET" to clear stale WhatsApp data.' }, { status: 400 })
  }

  const [sessions, messages, groups] = await Promise.all([
    db.from('whatsapp_sessions').delete().neq('wa_jid', ''),
    db.from('whatsapp_messages').delete().gt('id', 0),
    db.from('whatsapp_marketing_groups').delete().neq('jid', ''),
  ])

  const error = sessions.error || messages.error || groups.error
  if (error) {
    console.error('[admin/whatsapp/reset] failed:', error.message)
    return NextResponse.json({ error: 'Could not clear the old WhatsApp data.' }, { status: 500 })
  }

  await db.from('whatsapp_control_audit').insert({
    actor: email,
    action: 'workspace:reset',
    detail: { reason: 'switch to official AseHanta WhatsApp number' },
  })

  return NextResponse.json({
    ok: true,
    cleared: { sessions: sessions.count ?? 0, messages: messages.count ?? 0, groups: groups.count ?? 0 },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
