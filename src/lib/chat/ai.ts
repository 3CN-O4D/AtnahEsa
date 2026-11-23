import { runTool, toolSchemas, type ToolName } from './tools'
import type { AdminAlert, ChatAction, ChatMessage, ChatState, HouseCardData } from './types'
import { CONTACT_INFO, PLATFORM_KNOWLEDGE } from './knowledge'
import { formsPrompt } from './forms'
import { WIFI_INSTALLATION_FEE } from '@/lib/constants'
import { extractRequestedCount } from './houseSearch'

const MAX_ROUNDS = 4

export interface AiChatResult {
  reply: string
  cards?: HouseCardData[]
  actions?: ChatAction[]
  /** Latest server-side draft/state from a tool call. */
  state?: Partial<ChatState>
  adminAlert?: AdminAlert
}

/**
 * System prompt for Ase. It tells the model exactly what tools are available,
 * when to use them, and how to format replies like a friendly Kenyan on WhatsApp.
 * The model calls the tools in the background, we return results, it formats
 * the final reply for the client.
 */
const SYSTEM_PROMPT = PLATFORM_KNOWLEDGE + `

You are Ase, a warm, friendly digital assistant for AseHanta — a Kenyan house-hunting platform based in Eldoret. People use you to find houses, request houses, book viewings, arrange movers and get WiFi.

HOW TO TALK (very important):
- Text exactly like a friendly Kenyan friend on WhatsApp — casual, warm, human. Never robotic, never formal.
- Short lines. One idea per line. A blank line between each thought, like separate text messages.
- Use *bold* for emphasis and light emoji the way a real person texts.
- Reply in the language the user writes in. If they write English, reply in English; if they write Swahili, Sheng, French, Chinese or anything else, match them. Never switch language on your own.
- Write normal sentence case — capitalise the first letter of each line and proper names (AseHanta, Jambonet, Kenya). Don't write everything in lowercase.
- If asked who you are or to explain AseHanta, say briefly: AseHanta is a Kenyan house-hunting platform (based in Eldoret) with verified homes, escrow-protected viewing fees, movers and home WiFi. Then ask what they need.
- Keep replies short — usually 2 to 6 short lines unless you are showing house matches.

SEPARATE BUBBLES (critical — how your reply is shown to the user):
- Put --- on its own line between separate thoughts to send them as individual chat bubbles, like real WhatsApp messages.
- Example:
  "Hey! I found 3 houses for you.
  ---
  Single Room in Kipkaren — KSh 3,500/mo
  ---
  Spacious Tiled Single Room — KSh 4,000/mo
  ---
  Tap a card below to view full details."
- If you write one paragraph with no --- marker, it shows as a single bubble.
- Do not put --- after every single line. Group related ideas together.

BUTTON MARKERS (critical — how to add clickable buttons):
- Use [[button text|url]] on its own line to add a clickable button to your reply.
- Example: [[Find me a house|https://www.asehanta.com/]]
- Example: [[Upload DP|https://www.asehanta.com/profile]]
- Example: [[View stats|https://www.asehanta.com/stats]]
- Only add buttons when genuinely useful. Not every reply needs buttons.
- Buttons only appear on the last bubble of your reply.
- After using [[button text|url]], the text inside the brackets is removed from the message body and shown as a button instead.

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
- When they want WiFi, start collecting those details naturally — no rigid form, no repeating questions.
- They can also browse plans at https://www.asehanta.com/wifi.

LANGUAGE RULES (read twice):
- Reply to the user in THEIR language — Chinese, Spanish, French, Swahili, English, whatever they write.
- NEVER default to Swahili or Sheng unless the user writes in Swahili or Sheng first.
- Emails and complaints sent to the admin team MUST be in English, regardless of what language the user speaks.
- If a user complains or asks for help in another language, chat back to them in their language, but file the complaint/notify_admin in English.

TOOLS — ALWAYS call a tool when the user asks about its topic, even mid-conversation. Don't guess data yourself.
- search_houses: Find real houses by area, bedrooms, budget, water/token. Call it ONCE with the user's full request for ANY house search — never invent listings. Pass count when the user asks for an exact number ("2 houses", "one in Kapsoya"). The tool parses "cheapest"/"lowest" as price-ascending, applies the area and bedroom filters, sorts the results and stores them for follow-ups.
- show_more_houses: Use this for "show more", "next", "more houses" or any follow-up asking for other results from the search you just did. It returns the next stored batch; do NOT call search_houses again for that.
- get_house: Look up ONE specific house by its listing id or a pasted listing link (e.g. https://www.asehanta.com/listings/<id>). Call it whenever the user asks about "that house", sends a listing link/id, or asks for more details or photos of a specific listing. Then summarise the details and mention that the photos/card are below.
- get_stats: Current house/hunter/lister counts
- wifi_packages: Real WiFi packages and prices
- movers: Real verified movers
- contact_info: AseHanta contact details
- page_links: Shortcut links to site pages
- notify_admin: Emails the AseHanta admin team and files a report. Use it for ANY important matter that needs a real human — complaints, bug reports, urgent problems, payment/listing issues, feature requests, partnership/business inquiries, or when the user wants to escalate or talk to a human. Ask for their name, contact (email/phone), and message — then call it. The email goes to the team in English. Confirm it was sent with the reference number. For urgent matters set priority to "urgent".
- submit_form: Saves whatever the user has told you for a house request, WiFi booking, mover request, viewing request or complaint. Call it as soon as you have any values, then ask only for what the server says is missing.
- request_password_reset / complete_password_reset: Reset an account password inside this chat. Email a code first, then finish with the code and new password.

STARTING A SUBMISSION — NEVER start one on your own. Only when the user clearly asks:
- "request a house" → collect details and call submit_form with form "house_request"
- "book wifi" → form "wifi_booking"
- "need a mover" → form "mover_request"
- "book a viewing" / "I want that house" → form "house_booking"
- "I have a complaint" / "report a problem" → form "complaint"
If someone just says "morning", "hello", "how many houses", or asks a random question, DO NOT start a submission. Just chat normally.

RULES:
- Never invent house listings, prices, or links — use search_houses.
- Never dump the whole database. If the user says "2 houses" or "one in Juniorate", send exactly that many. Otherwise show at most 5 and offer "say show more". The tool result reports how many were sent and how many remain.
- For follow-ups like "which of those is cheapest?", use the LAST HOUSE SEARCH block instead of searching again. It already has the sorted result set.
- "The first/second/third", "#2", "this one" and "that house" refer to a card already shown. Use the quoted/selection context supplied by the bridge or the last displayed card order — never start a new search or list every house again.
- When asked for full details or all photos of a house, use get_house and include rent, viewing fee, deposit, water, electricity, vacancy, issues and the full description. Say the photos are below.
- Never reveal lister private contact details.
- If a user greets you or chats socially, reply warmly and briefly.
- After a house search, mention the card preview that appears below.
- Be conversational and human. Short lines, one idea per message. Use --- between separate bubbles. Use [[button text|url]] for buttons.
- Never say "I don't know that yet", "I'm still learning" or "invalid input". If something is outside your knowledge, answer from what you do know or hand off to the team naturally.

${formsPrompt()}
`

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export function aiEnabled(): boolean {
  return Boolean(process.env.AI_API_KEY || process.env.NVIDIA_API_KEY || process.env.TOKENHARBOR_API_KEY)
}

export function aiKey(): string {
  return process.env.NVIDIA_API_KEY || process.env.AI_API_KEY || process.env.TOKENHARBOR_API_KEY || ''
}

export function aiProvider(): 'nvidia' | 'tokenharbor' | 'openai' {
  const explicit = (process.env.AI_PROVIDER || '').toLowerCase()
  if (explicit === 'nvidia') return 'nvidia'
  if (explicit === 'tokenharbor') return 'tokenharbor'
  if (explicit === 'openai') return 'openai'
  const key = aiKey()
  if (key.startsWith('nvapi-')) return 'nvidia'
  if (key.startsWith('thk_')) return 'tokenharbor'
  return 'openai'
}

export function aiEndpoint(): string {
  const base =
    process.env.AI_BASE_URL ||
    (aiProvider() === 'nvidia' ? 'https://integrate.api.nvidia.com/v1' : 'https://tokenharbor.ai/v1')
  return base.replace(/\/$/, '') + '/chat/completions'
}

export function aiModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL
  if (aiProvider() === 'nvidia') return 'nvidia/nemotron-3.5-lightning-30b-a3b'
  return 'deepseek-v4.1-flash:free'
}

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

/** Tidy model output: capitalise sentence starts, but never rewrite URLs. */
function polishReply(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      if (/^\s*(https?:\/\/|www\.)/i.test(line)) return line
      return line.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix: string, letter: string) => prefix + letter.toUpperCase())
    })
    .join('\n')
}

/** Primary AI handler. The model calls tools in the background, we return results, it formats the reply. */
export async function aiChat(
  history: ChatMessage[],
  userMessage: string,
  state?: Partial<ChatState> | null,
  quoted?: { id?: string | null; text?: string | null; listingId?: string | null; title?: string | null; index?: number | null; kind?: string | null } | null,
): Promise<AiChatResult | null> {
  if (!aiEnabled()) return null

  const messages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(state?.form || (state?.draft && Object.keys(state.draft).length)
      ? [
          {
            role: 'system' as const,
            content: `CURRENT SERVER DRAFT (do not ask for anything already here):\n${JSON.stringify(
              { form: state?.form ?? null, data: state?.draft ?? {} }
            )}`,
          },
        ]
      : []),
    ...(state?.search
      ? [
          {
            role: 'system' as const,
            content:
              `LAST HOUSE SEARCH (structured, sorted; use for follow-ups, do NOT search again).\n` +
              `These are the ONLY houses in this conversation. The index is the number the customer saw. ` +
              `Resolve "the first", "#2", "the one after the Kapsoya one", "the 1BR with water included" etc. ` +
              `from this ordered list, then call get_house with that exact id. Never invent a listing. ` +
              `If two houses match equally, ask one short clarifying question instead of listing everything again.\n` +
              `${JSON.stringify(
                {
                  query: state.search.query,
                  filters: state.search.filters,
                  total: state.search.total,
                  shown: state.search.shown,
                  pageSize: state.search.pageSize,
                  results: state.search.results.map((r, index) => ({
                    index: index + 1,
                    visible: index < (state.search?.shown ?? 0),
                    id: r.card.id,
                    title: r.card.title,
                    location: r.card.location,
                    descriptive_location: r.card.descriptive_location,
                    rent: r.rent,
                    house_type: r.card.house_type,
                    water: r.card.water,
                    deposit: r.card.deposit,
                    deposit_refundable: r.card.deposit_refundable,
                    vacancy: r.card.vacancy,
                    status: r.card.status,
                    photos: r.card.images?.length ?? (r.card.image ? 1 : 0),
                    score: r.score,
                  })),
                }
              )}`,
          },
        ]
      : []),
    ...(Array.isArray(state?.messageRefs) && state.messageRefs.length
      ? [
          {
            role: 'system' as const,
            content: `LAST CARDS DISPLAYED IN THIS CHAT (exact order the customer saw):\n${JSON.stringify(
              state.messageRefs
                .filter((ref) => ref.kind === 'card')
                .map((ref) => ({
                  id: ref.id,
                  index: ref.index ?? null,
                  listing_id: ref.listingId ?? null,
                  title: ref.title ?? null,
                }))
            )}`,
          },
        ]
      : []),
    ...(quoted
      ? [
          {
            role: 'system' as const,
            content: `THE CUSTOMER REPLIED TO A SPECIFIC MESSAGE (use this exact target when they say "this", "that", "it", "the first one", "book it", etc.):\n${JSON.stringify(
              {
                id: quoted.id ?? null,
                kind: quoted.kind ?? null,
                index: quoted.index ?? null,
                listing_id: quoted.listingId ?? null,
                title: quoted.title ?? null,
                quoted_text: quoted.text ?? null,
              }
            )}\nIf listing_id is present, that is the house they mean. Do not search again or pick a different listing.`,
          },
        ]
      : []),
    ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content.slice(0, 2000) })),
    { role: 'user', content: userMessage.slice(0, 1000) },
  ]

  const cards: HouseCardData[] = []
  const seen = new Set<string>()
  const actions: ChatAction[] = []
  let statePatch: Partial<ChatState> | undefined
  let adminAlert: AdminAlert | undefined

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
          const plainContent: string | null = data?.choices?.[0]?.message?.content ?? null
          return plainContent ? { reply: polishReply(plainContent), cards, adminAlert } : null
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
          if (name === 'search_houses') {
            const query = typeof args.query === 'string' ? args.query : ''
            const requestedCount = extractRequestedCount(userMessage)
            if (requestedCount) args.count = requestedCount
            if (/\d/.test(userMessage)) {
              args.query = userMessage
            } else if (!query.trim()) {
              args.query = userMessage
            }
          }
          const result = await runTool(name, args, state)
          if (result.adminAlert) adminAlert = result.adminAlert
          if (result.state) statePatch = { ...(statePatch ?? {}), ...result.state }
          if ((result.data as { kind?: string } | undefined)?.kind === 'house_search_more') {
            // "Show more" should display the next batch, not re-show the first five.
            cards.length = 0
            seen.clear()
          }
          for (const action of result.actions ?? []) actions.push(action)
          for (const c of result.cards ?? []) {
            if (!seen.has(c.id)) {
              seen.add(c.id)
              cards.push(c)
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({
              ok: result.ok,
              text: result.text,
              error: result.error,
              data: result.data,
            }),
          })
        }
        continue
      }

      return { reply: polishReply(content ?? ''), cards, actions, state: statePatch, adminAlert }
    }
    return null
  } catch (err) {
    console.error('[chat] AI request failed:', err instanceof Error ? err.message : err)
    return null
  }
}