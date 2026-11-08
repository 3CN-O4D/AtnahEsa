import { runTool, toolSchemas, type ToolName } from './tools'
import type { ChatMessage, HouseCardData } from './types'
import { CONTACT_INFO } from './knowledge'

const MAX_ROUNDS = 3

export interface AiChatResult {
  reply: string
  cards?: HouseCardData[]
}

const SYSTEM_PROMPT = `You are Ase, the friendly digital assistant for AseHanta (asehanta.com), a Kenyan house-hunting platform in Eldoret and beyond. Introduce yourself as "Ase" when asked, and briefly tell users what you can help with (house search, house requests, WiFi, movers, stats, terms/escrow, contact), then offer help.

WHAT ASEHANTA IS:
- Listings of available houses (book a viewing), taken houses, verified movers, and home WiFi packages (e.g. Jambonet).
- Booking: a hunter pays a small booking fee via M-Pesa (PayWave Express STK push), held in escrow for a 24-hour view window. After viewing they confirm; then funds are released to the lister or refunded.
- Refunds: 100% if lister no-show/fake listing, 85% if the house mismatched the advert, 50% when blame is shared.
- Contact: email ${CONTACT_INFO.email}, phone ${CONTACT_INFO.phone}, WhatsApp ${CONTACT_INFO.whatsapp}.

HOW TO BEHAVE:
- Be warm and human, NOT robotic. Chat like a kind Kenyan friend on WhatsApp.
- Write in short, natural lines — like texting. No long paragraphs, no formal essay-style replies.
- Each idea on its own line. Use a line break between thoughts (like the message on this platform).
- Keep replies short: usually 2–8 short lines. Only go longer when listing matching houses.
- Format replies like WhatsApp: *bold* for emphasis, _italic_, - for lists.
- Use a light touch of emoji, the way a real person texts.
- To find houses, ALWAYS call the search_houses tool — never invent listings, prices or links.
- Use get_stats, wifi_packages, movers, contact_info and page_links tools when the user asks about those topics.
- If the user wants to book WiFi, request a mover, or submit a house request, guide them: either tell them to say things like "book wifi", "need a mover", or "request a house" so the guided assistant can collect their details.
- Never reveal lister private contacts.
- If unsure or off-topic, be friendly and point to the contact page: ${'https://www.asehanta.com/contact'}.`

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_API_KEY || process.env.TOKENHARBOR_API_KEY)
}

function aiEndpoint(): string {
  return (process.env.AI_BASE_URL || 'https://tokenharbor.ai/v1').replace(/\/$/, '') + '/chat/completions'
}

function aiKey(): string {
  return process.env.AI_API_KEY || process.env.TOKENHARBOR_API_KEY || ''
}

function aiModel(): string {
  return process.env.AI_MODEL || 'deepseek-v4.1-flash:free'
}

/** Call the AI. Returns text reply or null when unavailable/error. */
export async function aiChat(
  history: ChatMessage[],
  userMessage: string,
): Promise<AiChatResult | null> {
  if (!aiEnabled()) return null

  const messages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content.slice(0, 2000) })),
    { role: 'user', content: userMessage.slice(0, 1000) },
  ]

  const cards: HouseCardData[] = []

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await fetch(aiEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey()}` },
        body: JSON.stringify({
          model: aiModel(),
          messages,
          tools: toolSchemas(),
          tool_choice: 'auto',
          temperature: 0.6,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(25_000),
      })

      if (!res.ok) {
        // Fall back to a tools-free call (some free models don't accept tools).
        if (round === 0) {
          const plain = await fetch(aiEndpoint(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey()}` },
            body: JSON.stringify({
              model: aiModel(),
              messages,
              temperature: 0.6,
              max_tokens: 600,
            }),
            signal: AbortSignal.timeout(25_000),
          })
          if (!plain.ok) return null
          const data = await plain.json()
          return { reply: data?.choices?.[0]?.message?.content ?? null, cards }
        }
        return null
      }

      const data = await res.json()
      const choice = data?.choices?.[0]
      const message = choice?.message
      const content: string | null = message?.content ?? null
      const toolCalls = message?.tool_calls

      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        messages.push({ role: 'assistant', content: content ?? '', tool_calls: toolCalls })
        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue
          const name = tc.function.name as ToolName
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            args = {}
          }
          const result = await runTool(name, args)
          if (result.cards) cards.push(...result.cards)
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
        }
        continue
      }

      return { reply: content ?? '', cards }
    }
    return null
  } catch {
    return null
  }
}
