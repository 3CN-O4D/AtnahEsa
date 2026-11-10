import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { handleChat } from '@/lib/chat/engine'
import { checkRateLimit } from '@/lib/rate-limit'
import { addSecurityHeaders } from '@/lib/security'
import type { ChatMessage, ChatState } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Internal brain endpoint for the Baileys WhatsApp worker.
 *
 * The worker pairs the official WhatsApp number, stores per-chat state in
 * Supabase and forwards every text message here. This route reuses exactly the
 * same engine, flows, tools and NVIDIA-powered prompt as the website chat, so
 * replies stay identical across both channels.
 *
 * Not public: it requires the shared `WHATSAPP_BRIDGE_SECRET` header. Keep how
 * to reach it out of the client bundle.
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
    NextResponse.json(body, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  )
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return json({ error: 'Unauthorised.' }, 401)
  }

  let body: {
    message?: unknown
    state?: Partial<ChatState> | null
    history?: ChatMessage[]
    phone?: unknown
    name?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 600) {
    return json({ error: 'Message must be between 1 and 600 characters.' }, 400)
  }

  const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+]/g, '').slice(0, 20) : 'unknown'

  // Per-sender limiter, independent of the website's per-IP limiter.
  const { allowed, retryAfter } = await checkRateLimit(`whatsapp:${phone}`, 20, 60)
  if (!allowed) {
    return json(
      {
        reply: `You're sending messages a little fast — please wait ${retryAfter}s and try again. 🙏`,
        state: { mode: 'chat', step: null, draft: {} },
      },
      429
    )
  }

  const safeMessage = message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()

  try {
    const result = await handleChat({
      message: safeMessage,
      state: body.state ?? null,
      history: Array.isArray(body.history) ? body.history.slice(-12) : [],
      channel: 'whatsapp',
    })
    return json(result)
  } catch (err) {
    console.error('[whatsapp] brain error:', err)
    return json(
      {
        reply: `Sorry — I hit a hiccup on my side. Please try again in a moment. 🙏`,
        state: { mode: 'chat', step: null, draft: {} },
      },
      500
    )
  }
}
