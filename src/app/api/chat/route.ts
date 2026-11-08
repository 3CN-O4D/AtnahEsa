import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { addSecurityHeaders } from '@/lib/security'
import { handleChat } from '@/lib/chat/engine'
import type { ChatRequest } from '@/lib/chat/types'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const { allowed, retryAfter } = await checkRateLimit(`chat:${getClientIp(req)}`, 20, 60)
  if (!allowed) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Too many messages from this connection. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    )
  }

  let body: ChatRequest
  try {
    body = await req.json()
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request.' }, { status: 400 }))
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 600) {
    return addSecurityHeaders(NextResponse.json({ error: 'Message must be between 1 and 600 characters.' }, { status: 400 }))
  }

  // Strip control characters that could trip up rendering.
  const safeMessage = message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()

  try {
    const result = await handleChat({
      message: safeMessage,
      state: body.state ?? null,
      history: Array.isArray(body.history) ? body.history.slice(-12) : [],
    })
    return addSecurityHeaders(NextResponse.json(result))
  } catch (err) {
    console.error('Chat error:', err)
    return addSecurityHeaders(
      NextResponse.json({ error: 'Something went wrong. Please try again in a moment.' }, { status: 500 })
    )
  }
}
