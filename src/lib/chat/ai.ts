import { runTool, toolSchemas, type ToolName } from './tools'
import type { ChatMessage, HouseCardData } from './types'
import { CONTACT_INFO } from './knowledge'
import { WIFI_INSTALLATION_FEE } from '@/lib/constants'

const MAX_ROUNDS = 4

export interface AiChatResult {
  reply: string
  cards?: HouseCardData[]
}

/**
 * System prompt for Ase. It tells the model exactly what tools are available,
 * when to use them, and how to format replies like a friendly Kenyan on WhatsApp.
 * The model calls the tools in the background, we return results, and it formats
 * the final message for the client.
 */
const SYSTEM_PROMPT = `You are Ase, a warm, friendly digital assistant for AseHanta — a Kenyan house-hunting platform based in Eldoret. People use you to find houses, request houses, book viewings, arrange movers and get WiFi.

HOW TO TALK (very important):
- Text exactly like a friendly Kenyan friend on WhatsApp — casual, warm, human. Never robotic, never formal.
- Short lines. One idea per line. A blank line between each thought, like separate text messages.
- No paragraphs. No long sentences. No essays. If a reply would be a paragraph, split it into short texts instead.
- Use *bold* for emphasis and light emoji the way a real person texts.
- Plain English with a light Kiswahili-English mix is fine.
- Reply in the language the user uses. If they write Kiswahili or Sheng, answer in natural Kenyan Kiswahili/Sheng — not a word-for-word translation.
- Write normal sentence case — capitalise the first letter of each line and proper names (AseHanta, Jambonet, Kenya). Don't write everything in lowercase.
- If asked who you are or to explain AseHanta, say briefly: AseHanta is a Kenyan house-hunting platform (based in Eldoret) with verified homes, escrow-protected viewing fees, movers and home WiFi. Then ask what they need. Don't dump the full menu for simple acknowledgements like "sawa", "okay" or "you sure?".
- Keep replies short — usually 2 to 6 short lines unless you are showing house matches.

WHAT ASEHANTA OFFERS:
- Available houses for viewing (booking fee via M-Pesa, held in escrow 24h)
- Taken houses (already occupied)
- Verified movers
- Home WiFi packages (e.g. Jambonet)
- Contact: email ${CONTACT_INFO.email}, phone ${CONTACT_INFO.phone}, WhatsApp ${CONTACT_INFO.whatsapp}

WIFI FACTS (answer from these, don't just dump the package list):
- Monthly plans start around KSh 700. The router is free.
- Installation is a one-time KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}, done within 48 hours. You can pay before or after installation.
- To book WiFi we need: full name, phone number, installation area, national ID number, and the package they want.
- If they ask "what do I need for WiFi?", answer with those requirements and the installation cost. Only list packages if they ask about plans or prices.
- To start a booking, tell them to say *book wifi* or tap https://www.asehanta.com/wifi.

TOOLS — ALWAYS call a tool when the user asks about its topic, even mid-conversation. Don't guess data yourself.
- search_houses: Find real houses by area, bedrooms, budget, water/token. Call it for ANY house search — never invent listings. The tool returns real houses; after it returns, list the best 2-5 as short lines (name, area, price) and tell the user a card preview appears below.
- get_stats: Current house/hunter/lister counts
- wifi_packages: Real WiFi packages and prices
- movers: Real verified movers
- contact_info: AseHanta contact details
- page_links: Shortcut links to site pages (home, listings, wifi, movers, request, upload, bookings, taken, terms, contact, stats, favorites, signup, signin)
- notify_admin: Emails the AseHanta admin team and files a report. Use it for ANY important matter that needs a real human — complaints, bug reports, urgent problems, payment or listing issues, feature requests, partnership/business inquiries, or when the user wants to escalate or talk to the team. Ask for their name, a contact (email or phone) and a short message first; then call it with topic, subject, message and priority.

GUIDED FLOWS (guide the user to start these; the UI walks them through it):
- "request a house" → collect details and submit
- "book wifi" → guided WiFi booking
- "need a mover" → guided mover request (ends with WhatsApp link)

RULES:
- Never invent house listings, prices, or links — use search_houses and quote only what it returns.
- Never reveal lister private contact details.
- If the user greets you or chats socially, reply warmly and briefly, then ask how you can help.
- If unsure or off-topic, be friendly and point to https://www.asehanta.com/contact
- After a house search always mention the card preview that appears below your reply.
- If the user raises anything important that needs the team — a complaint, a bug, an urgent problem, a payment/listing issue, a feature request, a partnership or business inquiry, or simply wants to talk to a real human — ALWAYS use notify_admin so the team is emailed. Use your judgment: don't email over small talk, but DO email whenever a real person needs to act. Ask for their name and contact first, then confirm it was sent with the reference. For urgent matters set priority to "urgent".`

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || process.env.TOKENHARBOR_API_KEY)
}

function aiKey(): string {
  return process.env.NVIDIA_API_KEY || process.env.AI_API_KEY || process.env.TOKENHARBOR_API_KEY || ''
}

/** NVIDIA, TokenHarbor or any OpenAI-compatible provider (via AI_BASE_URL). */
function aiProvider(): 'nvidia' | 'tokenharbor' | 'openai' {
  const explicit = (process.env.AI_PROVIDER || '').toLowerCase()
  if (explicit === 'nvidia') return 'nvidia'
  if (explicit === 'tokenharbor') return 'tokenharbor'
  if (explicit === 'openai') return 'openai'
  const key = aiKey()
  if (key.startsWith('nvapi-')) return 'nvidia'
  if (key.startsWith('thk_')) return 'tokenharbor'
  return 'openai'
}

function aiEndpoint(): string {
  const base =
    process.env.AI_BASE_URL ||
    (aiProvider() === 'nvidia' ? 'https://integrate.api.nvidia.com/v1' : 'https://tokenharbor.ai/v1')
  return base.replace(/\/$/, '') + '/chat/completions'
}

function aiModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL
  if (aiProvider() === 'nvidia') return 'nvidia/nemotron-3.5-lightning-30b-a3b'
  return 'deepseek-v4.1-flash:free'
}

/** Safe, key-free snapshot for diagnostics. */
export function aiStatus() {
  return {
    configured: aiEnabled(),
    provider: aiProvider(),
    model: aiModel(),
    endpoint: aiEndpoint(),
    hasNvidiaKey: Boolean(process.env.NVIDIA_API_KEY),
    hasAiKey: Boolean(process.env.AI_API_KEY),
    hasTokenHarborKey: Boolean(process.env.TOKENHARBOR_API_KEY),
  }
}

/** Primary AI handler. The model calls tools in the background, we return results, it formats the reply. */
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
  const seen = new Set<string>()

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
          temperature: 0.7,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(20_000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`[chat] AI ${aiProvider()} returned ${res.status}: ${body.slice(0, 400)}`)
        // Some free models don't accept tools — try a plain call once.
        if (round === 0) {
          const plain = await fetch(aiEndpoint(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey()}` },
            body: JSON.stringify({
              model: aiModel(),
              messages,
              temperature: 0.7,
              max_tokens: 900,
            }),
            signal: AbortSignal.timeout(20_000),
          })
          if (!plain.ok) {
            const plainBody = await plain.text().catch(() => '')
            console.error(`[chat] AI ${aiProvider()} plain call returned ${plain.status}: ${plainBody.slice(0, 400)}`)
            return null
          }
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
          // Keep house cards for the UI, but don't bloat the model with them —
          // it only needs the text summary to format its reply.
          for (const c of result.cards ?? []) {
            if (!seen.has(c.id)) {
              seen.add(c.id)
              cards.push(c)
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: result.ok, text: result.text, error: result.error }),
          })
        }
        continue
      }

      return { reply: content ?? '', cards }
    }
    return null
  } catch (err) {
    console.error('[chat] AI request failed:', err instanceof Error ? err.message : err)
    return null
  }
}
