import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHATSAPP_NUMBER } from '@/lib/constants'
import type { ChatMessage, ChatState } from './types'

/**
 * Conversation hand-off between the website chat and the WhatsApp bot.
 *
 * A hand-off is a single-use, 24-hour token that stores the live engine state
 * plus the last few messages. The other channel redeems it and picks up exactly
 * where the user stopped — no repeated questions, no lost flow (e.g. a
 * half-finished WiFi booking survives the switch).
 */

export type HandoffDirection = 'web_to_whatsapp' | 'whatsapp_to_web'

export interface HandoffRow {
  token: string
  direction: HandoffDirection
  name: string | null
  phone: string | null
  summary: string | null
  state: ChatState
  history: ChatMessage[]
  created_at: string
  expires_at: string
  used_at: string | null
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.asehanta.com').replace(/\/$/, '')

function sanitiseHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return history
    .filter((m): m is ChatMessage => Boolean(m) && typeof m === 'object' && typeof (m as ChatMessage).content === 'string')
    .slice(-12)
    .map((m) => ({
      role: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant',
      content: String(m.content).slice(0, 2000),
    }))
}

export function handoffWebUrl(token: string): string {
  return `${SITE_URL}/chat?h=${encodeURIComponent(token)}`
}

export function handoffWhatsAppUrl(token: string, summary?: string | null): string {
  const intro = summary ? `I was chatting with Ase on the website.\n\nLast thing: ${summary.slice(0, 300)}` : 'I was chatting with Ase on the website just now.'
  const text = `Hi Ase 👋\n\n${intro}\n\nRef: AS-${token}`
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`
}

export async function createHandoff(input: {
  direction: HandoffDirection
  name?: string | null
  phone?: string | null
  summary?: string | null
  state?: Partial<ChatState> | null
  history?: ChatMessage[] | null
}): Promise<{ token: string; url: string }> {
  const token = randomBytes(18).toString('base64url')
  const supabase = createAdminClient()

  const { error } = await supabase.from('chat_handoffs').insert({
    token,
    direction: input.direction,
    name: (input.name ?? '').toString().slice(0, 100) || null,
    phone: (input.phone ?? '').toString().replace(/[^\d+]/g, '').slice(0, 20) || null,
    summary: (input.summary ?? '').toString().slice(0, 500) || null,
    state: input.state ?? {},
    history: sanitiseHistory(input.history),
  })

  if (error) throw new Error(`Could not create hand-off: ${error.message}`)

  const url =
    input.direction === 'web_to_whatsapp'
      ? handoffWhatsAppUrl(token, input.summary ?? null)
      : handoffWebUrl(token)

  return { token, url }
}

/**
 * Redeem a hand-off token once. Returns `null` when the token is unknown,
 * already used or expired, so callers can fall back to a normal chat.
 */
export async function consumeHandoff(token: string, direction?: HandoffDirection): Promise<HandoffRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const supabase = createAdminClient()

  let query = supabase
    .from('chat_handoffs')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())

  if (direction) query = query.eq('direction', direction)

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null

  // Consume atomically: only the first redeem wins.
  const { data: claimed } = await supabase
    .from('chat_handoffs')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .is('used_at', null)
    .select('*')
    .maybeSingle()

  if (!claimed) return null

  return {
    ...(claimed as HandoffRow),
    state: (claimed.state ?? {}) as ChatState,
    history: Array.isArray(claimed.history) ? (claimed.history as ChatMessage[]) : [],
  }
}
