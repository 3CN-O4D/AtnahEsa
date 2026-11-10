import { NextResponse } from 'next/server'
import { consumeHandoff, createHandoff, type HandoffDirection } from '@/lib/chat/handoff'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { addSecurityHeaders } from '@/lib/security'
import type { ChatMessage, ChatState } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * Conversation hand-off between the website chat and the WhatsApp bot.
 *
 * POST — create a single-use token that carries the current chat state and
 *        history, and get back the link to open on the other channel.
 * GET  — redeem a token (used by the web chat when it loads with `?h=`).
 *
 * Tokens are unguessable, single-use and expire after 24 hours.
 */

function json(body: unknown, status = 200) {
  return addSecurityHeaders(
    NextResponse.json(body, {
      status,
      headers: { 'Cache-Control': 'no-store' },
    })
  )
}

const DIRECTIONS: HandoffDirection[] = ['web_to_whatsapp', 'whatsapp_to_web']

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const { allowed, retryAfter } = await checkRateLimit(`handoff:create:${ip}`, 12, 60)
  if (!allowed) {
    return json({ error: `Slow down a little — try again in ${retryAfter}s.` }, 429)
  }

  let body: {
    direction?: unknown
    name?: unknown
    phone?: unknown
    summary?: unknown
    state?: Partial<ChatState> | null
    history?: ChatMessage[] | null
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const direction: HandoffDirection = DIRECTIONS.includes(body.direction as HandoffDirection)
    ? (body.direction as HandoffDirection)
    : 'web_to_whatsapp'

  try {
    const { token, url } = await createHandoff({
      direction,
      name: typeof body.name === 'string' ? body.name : null,
      phone: typeof body.phone === 'string' ? body.phone : null,
      summary: typeof body.summary === 'string' ? body.summary : null,
      state: body.state ?? null,
      history: Array.isArray(body.history) ? body.history : null,
    })
    return json({ token, url, direction })
  } catch (err) {
    console.error('[handoff] create failed:', err)
    return json({ error: 'Could not start the hand-off. Please try again.' }, 500)
  }
}

export async function GET(req: Request) {
  const ip = getClientIp(req)
  const { allowed, retryAfter } = await checkRateLimit(`handoff:read:${ip}`, 30, 60)
  if (!allowed) {
    return json({ error: `Slow down a little — try again in ${retryAfter}s.` }, 429)
  }

  const token = new URL(req.url).searchParams.get('token') ?? ''
  if (!token) return json({ error: 'Missing token.' }, 400)

  try {
    const row = await consumeHandoff(token)
    if (!row) {
      return json({ error: 'This hand-off has expired or was already used.' }, 410)
    }
    return json({
      direction: row.direction,
      name: row.name,
      phone: row.phone,
      summary: row.summary,
      state: row.state,
      history: row.history,
    })
  } catch (err) {
    console.error('[handoff] redeem failed:', err)
    return json({ error: 'Could not load the hand-off. Please try again.' }, 500)
  }
}
