import { NextResponse } from 'next/server'
import { addSecurityHeaders } from '@/lib/security'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireAdminRequest } from '@/lib/admin-copilot/auth'
import { executeConfirmedAction, runCopilot } from '@/lib/admin-copilot/agent'
import type { CopilotMessage } from '@/lib/admin-copilot/agent'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Admin-only copilot.
 *
 * Every request re-verifies the Supabase session and `profiles.role = 'admin'`
 * server-side. Writes never execute from a model message: they require a signed
 * confirmation token that the admin explicitly approves in the dashboard.
 */
export async function POST(req: Request) {
  const auth = await requireAdminRequest(req)
  if (!auth.ok) return auth.response
  const { context: ctx } = auth

  const { allowed, retryAfter } = await checkRateLimit(`admin-copilot:${ctx.userId}`, 40, 60)
  if (!allowed) {
    return addSecurityHeaders(
      NextResponse.json(
        { error: 'Too many copilot requests. Please wait a moment and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    )
  }

  let body: {
    message?: unknown
    history?: unknown
    confirmation_token?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return addSecurityHeaders(NextResponse.json({ error: 'Invalid request.' }, { status: 400 }))
  }

  // Confirm step: run the exact action the admin approved.
  if (typeof body.confirmation_token === 'string' && body.confirmation_token) {
    const result = await executeConfirmedAction(body.confirmation_token, ctx)
    return addSecurityHeaders(
      NextResponse.json({
        reply: result.reply,
        pending_action: null,
        refresh: result.ok,
        quickReplies: ['Platform stats', 'Show recent activity', 'What else can you do?'],
      })
    )
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 3000) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'Message must be between 1 and 3000 characters.' }, { status: 400 })
    )
  }

  const history: CopilotMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (item): item is CopilotMessage =>
            Boolean(item) &&
            typeof item === 'object' &&
            (item as { role?: unknown }).role !== undefined &&
            ((item as { role?: unknown }).role === 'user' || (item as { role?: unknown }).role === 'assistant') &&
            typeof (item as { content?: unknown }).content === 'string'
        )
        .slice(-12)
        .map((item) => ({ role: item.role, content: item.content }))
    : []

  const result = await runCopilot({ ctx, message, history })
  return addSecurityHeaders(NextResponse.json(result))
}
