import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { addSecurityHeaders } from '@/lib/security'
import { generateMarketingDraft } from '@/lib/whatsapp/marketing'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Marketing draft generator for the Baileys worker.
 *
 * The worker asks for one draft per status/group slot. Wording is written by
 * the same NVIDIA-powered model as the chat, from real listing rows only — see
 * `src/lib/whatsapp/marketing.ts`. A template is used when the model is down.
 *
 * Internal only: requires `WHATSAPP_BRIDGE_SECRET`.
 */

function authorised(req: Request): boolean {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET
  if (!secret) return false
  const supplied = req.headers.get('x-bridge-secret') ?? ''
  const a = createHash('sha256').update(supplied).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}

function json(body: unknown, status = 200) {
  return addSecurityHeaders(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  )
}

export async function POST(req: Request) {
  if (!authorised(req)) return json({ error: 'Unauthorised.' }, 401)

  let body: { channel?: unknown; target_jid?: unknown; topic?: unknown; auto?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const channel = body.channel === 'group' ? 'group' : body.channel === 'status' ? 'status' : null
  if (!channel) return json({ error: 'channel must be status or group' }, 400)

  const targetJid = typeof body.target_jid === 'string' ? body.target_jid : null
  if (channel === 'group' && !targetJid) {
    return json({ error: 'target_jid is required for group posts' }, 400)
  }

  const topic = typeof body.topic === 'string' ? body.topic : 'auto'
  const auto = body.auto !== false

  try {
    const draft = await generateMarketingDraft({
      channel,
      target_jid: targetJid,
      topic,
      auto,
      created_by: auto ? 'marketing' : 'admin',
    })
    return json({ draft })
  } catch (error) {
    console.error('[marketing] generate failed:', error instanceof Error ? error.message : error)
    return json({ error: 'Could not generate a draft.' }, 500)
  }
}
