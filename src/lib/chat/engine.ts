import type { ChatRequest, ChatResponse, ChatState, ChatAction, QuotedContext } from './types'
import { emptyState } from './types'
import { FAQ, PAGE_LINKS, CONTACT_INFO, WIFI_REQUIREMENTS } from './knowledge'
import { searchHouses, parseHouseQuery } from './houseSearch'
import {
  toolStats,
  toolWifiPackages,
  toolMovers,
  toolContact,
  toolGetHouse,
  toolShowMore,
} from './tools'
import { aiChat, aiEnabled } from './ai'
import { createHandoff } from './handoff'

const AREA_WORDS = [
  'kipkaren', 'anex', 'annex', 'langas', 'kapsoya', 'pioneer', 'kokwas', 'juniorate', 'juniors',
  'eldoret', 'nairobi', 'mombasa', 'kisumu', 'westlands', 'nyali', 'mtwapa', 'kileleshwa', 'milimani',
  'kilimani', 'south b', 'karen', 'runda', 'nyayo', 'kapseret', 'huruma', 'moi university', 'itigo', 'baringo', 'kokwet', 'mega',
]

const BEDROOM_RE = /\b(?:bedsitter|studio|bungalow|townhouse|apartment|1\s?br|2\s?br|3\s?br|4\s?br|one\s*bedroom|two\s*bedroom|three\s*bedroom)\b/i

const CANCEL_RE = /^(cancel|stop|never ?mind|nevermind|forget it|abort|exit|quit|hapana|acha)\b/i
const SHOW_MORE_RE = /\b(?:show|see|send|give|get)\s+(?:me\s+)?(?:more|another|next|other)\b|\bmore\s+(?:houses|homes|rooms|options|results)\b|\bnext\s+(?:houses|homes|ones|batch)\b/i

const HUMAN_HANDOFF_RE =
  /\b(?:real|actual|live)\s+(?:human|person|admin|agent)\b|\b(?:connect|put|transfer)\s+me\s+(?:to|through to|with)\s+(?:(?:a|the|one of the)\s+)?(?:real\s+)?(?:human|person|admin|agent|team)\b|\b(?:talk|speak|chat)\s+(?:to|with)\s+(?:a\s+)?(?:real\s+)?(?:human|person|admin|agent|someone)\b|\bone of (?:the|our) admins?\b|\b(?:an admin|the admin team|support agent)\b/i

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3,
  fourth: 4, '4th': 4, fifth: 5, '5th': 5, sixth: 6, '6th': 6,
  seventh: 7, '7th': 7, eighth: 8, '8th': 8, ninth: 9, '9th': 9,
  tenth: 10, '10th': 10,
}

interface ListingChoice {
  listingId: string
  title?: string | null
  index: number
  location?: string | null
  houseType?: string | null
  water?: string | null
  rent?: number
}

function clampOrdinal(value: number): number | null {
  return Number.isFinite(value) && value >= 1 && value <= 20 ? Math.round(value) : null
}

/** "the first", "#2", "3rd", "last" — never "1 bedroom". */
export function parseOrdinal(text: string): number | null {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim()
  if (/\blast\b/.test(t)) return -1
  const hash = t.match(/(?:^|[\s*`_])#(\d{1,2})\b/)
  if (hash) return clampOrdinal(Number(hash[1]))
  const word = t.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|seventh|7th|eighth|8th|ninth|9th|tenth|10th)\b/)
  if (word) return clampOrdinal(ORDINAL_WORDS[word[1]] ?? Number.parseInt(word[1], 10))
  const bare = t.match(/^(?:it(?:'s| is)\s+|that(?:'s| is)\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/)
  const afterLeadIn = t.replace(/^(?:it(?:'s| is)\s+|that(?:'s| is)\s+|the\s+)+/, '')
  if (bare && !/^\d+\s*(?:bed|br|room|house|home|listing)/.test(afterLeadIn)) {
    return clampOrdinal(Number(bare[1]))
  }
  return null
}

function isNewHouseSearch(text: string): boolean {
  return (
    /\b(find|search|looking for|need a house|need a home|do you have|available houses|available homes|any houses?|any homes?|list houses)\b/.test(text) ||
    /\b(send|show)\s+(?:me\s+)?(?:just\s+|only\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:houses?|homes?|listings?|options?)\b/.test(text)
  )
}

function wantsSelectedHouse(text: string, ordinal: number | null): boolean {
  if (isNewHouseSearch(text)) return false
  if (ordinal !== null) return true
  const pointsAtHouse = /\b(this|that|it|here|one|ones|house|home|listing|card|them|those)\b/.test(text)
  const asksAboutIt =
    /\b(book|booking|details?|full|photos?|pictures?|images?|about|tell|show|send|give|link|price|rent|deposit|water|fetch|open|what|where|how much|contact|call|view|describe|want|take|choose|pick|keep|mine)\b/.test(text)
  return pointsAtHouse && asksAboutIt
}

/**
 * Prefer the cards actually shown in the last bot turn. Older sessions have no
 * messageRefs, so fall back to the ordered results from the stored search.
 */
function recentCardChoices(state: ChatState): ListingChoice[] {
  const results = state.search?.results ?? []
  const metaFor = (id: string) => results.find((result) => result.card.id === id)?.card ?? null
  const withMeta = (choice: ListingChoice): ListingChoice => {
    const card = metaFor(choice.listingId)
    return {
      ...choice,
      title: choice.title || card?.title || null,
      location: card?.location ?? null,
      houseType: card?.house_type ?? null,
      water: card?.water ?? null,
      rent: card?.rent,
    }
  }

  const refs = Array.isArray(state.messageRefs) ? state.messageRefs : []
  const tail: ListingChoice[] = []
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    const ref = refs[i]
    if (!ref || ref.kind !== 'card' || !ref.listingId) break
    tail.unshift(
      withMeta({
        listingId: ref.listingId,
        title: ref.title ?? null,
        index: ref.index ?? tail.length + 1,
      })
    )
  }
  if (tail.length) return tail.map((choice, i) => ({ ...choice, index: choice.index || i + 1 }))

  const shown = Math.max(1, Math.min(state.search?.shown ?? results.length, results.length))
  return results.slice(0, shown).map((result, i) =>
    withMeta({
      listingId: result.card.id,
      title: result.card.title,
      index: i + 1,
    })
  )
}

function normaliseTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function choiceByTitle(choices: ListingChoice[], text: string): ListingChoice | null {
  const needle = normaliseTitle(text)
  for (const choice of choices) {
    const title = normaliseTitle(choice.title ?? '')
    if (!title) continue
    if (needle.includes(title)) return choice
    const tokens = title.split(' ').filter((word) => word.length > 2)
    if (tokens.length > 0 && tokens.every((word) => needle.includes(word))) return choice
  }
  return null
}

function bedroomToken(text: string): string | null {
  const match = text.match(/\b(1|2|3|4|5|one|two|three|four|five)\s*(?:br|bedroom|bed)\b/i)
  if (!match) return null
  const words: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5' }
  return /^\d$/.test(match[1]) ? match[1] : (words[match[1].toLowerCase()] ?? null)
}

/** "the one after the Kapsoya one" → the next card in the displayed order. */
function selectRelativeChoice(choices: ListingChoice[], message: string): ListingChoice | null {
  const match = message.match(/\b(?:the\s+)?(?:one|house|listing|card)\s+after\s+(?:the\s+)?([^?!.]+)/i)
  if (!match) return null
  const anchor = normaliseTitle(match[1]).replace(/\b(?:one|house|listing|card|please)\b/g, '').trim()
  if (!anchor) return null
  const index = choices.findIndex((choice) => {
    const hay = normaliseTitle(`${choice.title ?? ''} ${choice.location ?? ''}`)
    return hay.includes(anchor) || anchor.includes(hay)
  })
  return index >= 0 ? choices[index + 1] ?? null : null
}

/** "the 1BR with water included", "the Kapsoya one" — filter the shown cards. */
function selectByAttributes(choices: ListingChoice[], message: string): ListingChoice | null {
  const low = message.toLowerCase()
  const bedroom = bedroomToken(low)
  const waterIncluded = /\b(?:water|rent)\s*(?:included|inclusive|incl)\b|\bincluded in rent\b|\brent inclusive\b/i.test(low)
  const area = AREA_WORDS.find((word) => low.includes(word)) ?? null
  if (!bedroom && !waterIncluded && !area) return null

  const matches = choices.filter((choice) => {
    const hay = normaliseTitle(`${choice.title ?? ''} ${choice.houseType ?? ''} ${choice.location ?? ''}`)
    if (bedroom && !hay.includes(`${bedroom}br`) && !hay.includes(`${bedroom} bedroom`)) return false
    if (waterIncluded && !/includ/i.test(choice.water ?? '')) return false
    if (area && !hay.includes(area)) return false
    return true
  })
  return matches[0] ?? null
}

/** A quoted card can carry a listing id, a caption URL, a "#2" number or a title. */
function quotedListingId(quoted: QuotedContext | null): string | null {
  if (!quoted) return null
  return quoted.listingId || extractListingId(quoted.text || '') || null
}

function quotedChoice(quoted: QuotedContext | null, choices: ListingChoice[]): ListingChoice | null {
  if (!quoted) return null
  const listingId = quotedListingId(quoted)
  if (listingId) {
    return (
      choices.find((choice) => choice.listingId === listingId) ?? {
        listingId,
        title: quoted.title ?? null,
        index: quoted.index ?? 1,
      }
    )
  }
  const ordinal = parseOrdinal(quoted.text || '')
  if (ordinal !== null && ordinal > 0) {
    return choices.find((choice) => choice.index === ordinal) ?? choices[ordinal - 1] ?? null
  }
  return choiceByTitle(choices, quoted.title || '')
}

export function selectListingChoice(message: string, state: ChatState, quoted?: QuotedContext | null): ListingChoice | null {
  const choices = recentCardChoices(state)
  if (choices.length === 0) return null

  // A new search wins over an old quote. Tagging a card then asking for two
  // houses in Kapsoya must search again, not reopen the tagged house.
  if (isNewHouseSearch(message.toLowerCase())) return null

  const fromQuote = quotedChoice(quoted ?? null, choices)
  if (fromQuote) return fromQuote

  const ordinal = parseOrdinal(message)
  if (ordinal !== null) {
    if (ordinal === -1) return choices[choices.length - 1]
    return choices.find((choice) => choice.index === ordinal) ?? choices[ordinal - 1] ?? null
  }

  const low = message.toLowerCase()

  const relative = selectRelativeChoice(choices, message)
  if (relative) return relative
  const byAttributes = selectByAttributes(choices, message)
  if (byAttributes) return byAttributes
  const byTitle = choiceByTitle(choices, message)
  if (byTitle) return byTitle
  if (!wantsSelectedHouse(low, null)) return null
  return choices[choices.length - 1]
}

/** Keep useful chat context (draft or the last house result set) between turns. */
function keepContext(state: ChatState): ChatState {
  const keep =
    Boolean(state.form) || Object.keys(state.draft ?? {}).length > 0 || Boolean(state.search)
  return keep ? { ...state } : emptyState()
}

/**
 * Account changes need a signed-in browser session, which the WhatsApp bridge
 * does not have. This is a security boundary, not a conversation script: it
 * fires once and sends the user to the profile page.
 */
const WHATSAPP_WEB_RE =
  /\b(change ?dp|change ?avatar|profile ?picture|update ?avatar|new ?profile ?picture|remove ?dp|delete ?dp|change ?email|update ?email|new email|delete ?account|remove ?account|deactivate ?account|close ?account)\b/i

export async function handleChat(input: ChatRequest): Promise<ChatResponse> {
  const msg = (input.message || '').trim().slice(0, 600)
  const prevState: ChatState = { ...emptyState(), ...(input.state ?? {}) }
  const history = Array.isArray(input.history) ? input.history.slice(-12) : []
  const quoted = input.quoted ?? null
  const low = msg.toLowerCase()

  // 1. Cancel an in-progress submission. No loop: the draft is simply dropped.
  if ((prevState.form || prevState.step || Object.keys(prevState.draft ?? {}).length) && CANCEL_RE.test(msg)) {
    return {
      reply: `Okay, I've cancelled that. Is there anything else I can help with? 🙂`,
      state: emptyState(),
    }
  }

  // 2. WhatsApp cannot touch the logged-in account.
  if (input.channel === 'whatsapp' && WHATSAPP_WEB_RE.test(low)) {
    return {
      reply:
        `🔐 That one needs a signed-in browser session, so I can't do it from WhatsApp.\n\n` +
        `Open https://www.asehanta.com/profile while signed in and change it there.\n\n` +
        `Anything else I can help with?`,
      state: emptyState(),
    }
  }

  // 2b. An explicit request for a person must talk to the team immediately —
  // never fall through to the "I'd rather not guess" brush-off. Handover is
  // WhatsApp-only: the bridge mirrors this alert to the admins' WhatsApp.
  if (input.channel === 'whatsapp' && HUMAN_HANDOFF_RE.test(msg)) {
    const subject = `Human handover — ${input.name || input.phone || 'WhatsApp user'}`
    const searchLine = prevState.search?.query ? ` Last house search: ${prevState.search.query}.` : ''
    const handoverListingId = quotedListingId(quoted)
    const targetLine = handoverListingId ? ` House they were viewing: ${quoted?.title || handoverListingId}.` : ''
    return {
      reply:
        `I've handed you over to the AseHanta team on WhatsApp — one of the admins will join this chat shortly 🙏\n\n` +
        `If you'd rather call now: ${CONTACT_INFO.whatsapp}\n\n` +
        `Anything else I can help with while you wait?`,
      actions: [linkAction('💬 WhatsApp support', CONTACT_INFO.whatsapp)],
      state: keepContext(prevState),
      adminAlert: {
        topic: 'human handover',
        subject,
        priority: 'high',
        message:
          `HANDOVER: Customer asked to speak to a real human/admin. Please pick up this WhatsApp chat. ` +
          `Last message: "${msg}".${targetLine}${searchLine}`,
        name: input.name ?? undefined,
        phone: input.phone && input.phone !== 'unknown' ? input.phone : undefined,
        listingId: handoverListingId ?? undefined,
      },
    }
  }

  // 3. A pasted listing link or listing id — fetch that exact house, with its
  // photos. Works even when the AI is off, and never invents listing data.
  // A pasted link is always explicit. A quoted caption is only a selection when
  // the new message is not itself asking for a fresh search.
  const listingId = extractListingId(msg) || (isNewHouseSearch(low) ? null : quotedListingId(quoted))
  if (listingId) {
    const house = await toolGetHouse(listingId)
    return {
      reply: house.text,
      actions: house.cards?.length ? [{ type: 'card', card: house.cards[0] }] : [linkAction('🏠 Open listing', `https://www.asehanta.com/listings/${listingId}`)],
      state: emptyState(),
    }
  }

  // 4. WhatsApp → website hand-off. The user wants to continue in a browser
  // (better for uploads and payments); mint a single-use token that carries
  // this chat's state and history to /chat.
  if (
    input.channel === 'whatsapp' &&
    /\b(continue|switch|move|open|use|go|take)\b[^.!?]{0,30}\b(web|website|browser|site|chat page)\b/.test(low)
  ) {
    try {
      const handoff = await createHandoff({
        direction: 'whatsapp_to_web',
        state: prevState,
        history: [...history, { role: 'user', content: msg }],
      })
      return {
        reply: `Sure — open this link to continue this chat in your browser. Your history and any half-finished request come with you. 💬\n\n${handoff.url}`,
        actions: [linkAction('💬 Open web chat', handoff.url)],
        state: prevState,
      }
    } catch (err) {
      console.error('[chat] web hand-off failed:', err)
    }
  }

  // 4b. "Show more" uses the stored, already-sorted result set. It never
  // re-runs a search, so the user is not spammed with the same twenty houses.
  if (SHOW_MORE_RE.test(low) && prevState.search) {
    const more = toolShowMore(prevState.search)
    return {
      reply: more.text,
      actions: (more.cards ?? []).map((card) => ({ type: 'card' as const, card })),
      state: { ...prevState, ...(more.state ?? {}) },
    }
  }

  // 4c. Deterministic follow-up: answer "which is cheapest?" straight from the
  // stored result set instead of searching again or trusting a model guess.
  if (
    prevState.search &&
    /^(?:which|what|how much|cheapest|lowest|most expensive|best|any of (?:those|them)|from (?:those|them)|among (?:those|them)|of (?:those|them))\b/i.test(
      low
    ) &&
    !/(find|search|looking for|need a house|do you have)\b/.test(low)
  ) {
    const ranked = [...prevState.search.results]
      .sort((a, b) => (/expensive|highest/i.test(low) ? b.rent - a.rent : a.rent - b.rent))
      .slice(0, 5)
    if (ranked.length) {
      const lines = ranked.map((r) => `${r.card.title} — KSh ${r.rent.toLocaleString()}/mo (${r.card.location})`)
      return {
        reply: `From those ${prevState.search.total} results, here are the ${/expensive|highest/i.test(low) ? 'priciest' : 'cheapest'} ${ranked.length}:\n${lines.join('\n')}\n\nTap a card for full details.`,
        actions: ranked.map((r) => ({ type: 'card' as const, card: r.card })),
        state: prevState,
      }
    }
  }

  // 4d. A quoted house card is an explicit selection. "this one", "book it",
  // "how much?" etc. answer from that exact listing rather than guessing from
  // the last search or starting a new search.
  if (quotedListingId(quoted) && !listingId && msg.length <= 120) {
    const searching = /\b(find|search|looking for|need a house|do you have|send me|show me \d)\b/i.test(low)
    const referring = /\b(this|that|it|here|one|house|price|rent|deposit|book|contact|details?|about|how much|location|where)\b/i.test(low) ||
      /^[?#\d.,!?\s]+$/.test(msg)
    if (referring && !searching) {
      const targetListingId = quotedListingId(quoted)!
      const house = await toolGetHouse(targetListingId)
      return {
        reply: `About ${quoted?.title ? `*${quoted.title}*` : 'that house'}:\n\n${house.text}`,
        actions: house.cards?.length
          ? [{ type: 'card', card: house.cards[0] }]
          : [{ type: 'link', label: '🏠 Open listing', href: `https://www.asehanta.com/listings/${targetListingId}` }],
        state: keepContext(prevState),
      }
    }
  }

  // 4e. "The first", "#2", "show all photos for the second house", "tell me
  // about this one" — resolve against the cards we actually displayed. This is
  // deterministic so the bot never has to guess which house the user meant.
  const selected = selectListingChoice(msg, prevState, quoted)
  if (selected && !listingId) {
    const house = await toolGetHouse(selected.listingId)
    if (house.ok !== false && house.cards?.length) {
      const asksPhotos = /\b(?:photo|photos|picture|pictures|image|images|all)\b/.test(low)
      const asksBooking = /\b(?:book|booking|view|viewing)\b/.test(low)
      const target = selected.title ? `*${selected.title}*` : 'that house'
      const intro = `You mean ${target} — got it ✅`
      const photoLine = asksPhotos ? `\n\nHere are all the photos I have for it.` : ''
      const bookingLine = asksBooking
        ? `\n\nI can book a viewing for this one. Please confirm your full name, phone number and the area you're coming from.`
        : ''
      return {
        reply: `${intro}${photoLine}\n\n${house.text}${bookingLine}`,
        actions: [{ type: 'card', card: house.cards[0] }],
        state: keepContext(prevState),
      }
    }
  }

  // 5. AI-first. The model chats naturally, calls tools in the background and
  // collects submissions from a declared field spec. It is the only driver of
  // multi-turn conversations; there are no step machines.
  if (aiEnabled()) {
    const ai = await aiChat(history, msg, prevState, quoted)
    if (ai && ai.reply) {
      const state = ai.state ? { ...prevState, ...ai.state } : keepContext(prevState)
      // Respect an explicit count ("send me 2 houses") instead of always
      // truncating to five at this boundary.
      const cardLimit = Math.max(1, Math.min(10, state.search?.pageSize ?? 5))
      const cardActions: ChatAction[] = (ai.cards ?? []).slice(0, cardLimit).map((c) => ({ type: 'card', card: c }))
      const actions = [...(ai.actions ?? []), ...cardActions]
      return {
        reply: ai.reply,
        actions: actions.length ? actions : undefined,
        state,
        adminAlert: ai.adminAlert,
      }
    }
  }

  // 6. Deterministic fallbacks below only run when the model is unavailable.
  // They keep the assistant useful instead of leaving users with dead air.
  if (/^(hi|hello|hey|heyy|hey there|hiya|yo|sup|habari|jambo|mambo|howdy|sasa|mzuri|poa|good\s*(morning|afternoon|evening)|morning|afternoon|evening)\b/i.test(msg) && msg.length < 50) {
    const greetings = ["Hi there 👋", "Hey 😊", "Hello! 👋", "Hi! How's it going?"]
    const pick = greetings[Math.floor(Math.random() * greetings.length)]
    return {
      reply: `${pick}\n\nHow can I be of help today?\n\nJust ask me anything — I can help with houses, WiFi, movers, escrow or getting in touch with our team.`,
      state: emptyState(),
    }
  }
  if (/\b(how are you|hows you|how's it going|how you doing|you good|all good)\b/i.test(low) && msg.length < 60) {
    return {
      reply: `I'm good, thanks for asking 😊\n\nHow about you? Anything I can help with today?`,
      state: emptyState(),
    }
  }
  if (/\b(thanks|thank you|asante|asante sana|nice|awesome|cool|great|perfect)\b/.test(low) && msg.length < 60) {
    return { reply: `You're most welcome! 😊 Anything else I can do for you?`, state: emptyState() }
  }
  if (/^(sawa|sawa sawa|okay|ok|okey|sure|yes|yeah|yep|ndio|poa|fine|alright)\b/i.test(low) && msg.length < 25) {
    return { reply: `Sawa! 😊 What would you like to do next?`, state: emptyState() }
  }
  if (/^(you sure|are you sure|really|seriously|kweli)\b/i.test(low) && msg.length < 30) {
    return {
      reply: `Yes, I'm sure 😊 I'm Ase, the AseHanta assistant. I can help with houses, WiFi, movers, escrow or getting you in touch with the team.`,
      state: emptyState(),
    }
  }
  if (/(about|kuhusu|nieleze|eleza|explain).*(asehanta|platform|site|hii)|who are you|what is asehanta|what does asehanta do/.test(low)) {
    return {
      reply: `*AseHanta* is a Kenyan house-hunting platform based in Eldoret 🏠\n\nWe list verified homes with real prices, protect viewing fees with escrow, and connect you with trusted movers and home WiFi.\n\nWhat would you like to do first?`,
      state: emptyState(),
      actions: [linkAction('🏠 Browse homes', PAGE_LINKS.listings.href), linkAction('📞 Contact us', PAGE_LINKS.contact.href)],
    }
  }
  if (/^(help|what can you do|how can you help|menu|options)\b/.test(low)) {
    const greetings = ["Hi there 👋", "Hey 😊", "Hello! 👋", "Hi! How's it going?"]
    const pick = greetings[Math.floor(Math.random() * greetings.length)]
    return {
      reply: `${pick}\n\nHere's what I can do:\n🏠 Find you a house\n📝 Request a house for you\n📊 Show you our stats\n📶 Help with WiFi packages\n🚚 Arrange a mover\n📄 Explain escrow & terms\n📞 Get you in touch with our team\n\nJust ask 🙂`,
      state: emptyState(),
    }
  }

  // 7. Statistics.
  if (/how many|stats|statistics|counts?|how many houses|numbers?|market data|current (listings|houses|users)/.test(low)) {
    const stats = await toolStats()
    return { reply: stats.text, state: emptyState(), actions: [linkAction('📊 View full stats', PAGE_LINKS.stats.href)] }
  }

  // 8a. WiFi requirements — answer "what do I need?" instead of dumping plans.
  if (
    /\b(wifi|internet|router)\b/.test(low) &&
    /\b(what (do|would) i need|requirements?|require|documents?|need to (get|apply|book)|needed for|need for)\b/.test(low)
  ) {
    return {
      reply: WIFI_REQUIREMENTS,
      state: emptyState(),
      actions: [linkAction('📶 Browse WiFi plans', PAGE_LINKS.wifi.href)],
    }
  }

  // 8b. WiFi packages.
  if (/\b(wifi|internet|router|wifi package|packages)\b/.test(low)) {
    const res = await toolWifiPackages()
    return { reply: res.text, state: emptyState(), actions: [linkAction('📶 Browse WiFi page', PAGE_LINKS.wifi.href)] }
  }

  // 9. Movers.
  if (/\b(mover|movers|moving)\b/.test(low)) {
    const res = await toolMovers()
    return { reply: res.text, state: emptyState(), actions: [linkAction('🚚 Browse movers', PAGE_LINKS.movers.href)] }
  }

  // 10. Contact details.
  if (/\b(contact|phone number|email|reach you|talk to|call us|support|whatsapp|address|location|office)\b/.test(low) && !/contact page/.test(low)) {
    const c = toolContact()
    return { reply: c.text, state: emptyState(), actions: [linkAction('💬 WhatsApp us', CONTACT_INFO.whatsapp), linkAction('📞 Contact page', PAGE_LINKS.contact.href)] }
  }

  // 11. Terms / escrow / refunds / payments (knowledge base).
  const faq = FAQ.find((f) => f.keywords.some((k) => low.includes(k)))
  if (faq && !/\b(find|search|show)\b/.test(low)) {
    const faqActions: ChatAction[] = [linkAction('📄 Full terms', PAGE_LINKS.terms.href)]
    if (faq.id === 'terms') {
      return { reply: faq.answer, state: emptyState(), actions: [
        linkAction('📄 Full terms', PAGE_LINKS.terms.href),
        linkAction('🐾 Visitor terms', 'https://www.asehanta.com/terms/visitor'),
        linkAction('🏠 Hunter terms', 'https://www.asehanta.com/terms/hunter'),
        linkAction('🏡 Lister terms', 'https://www.asehanta.com/terms/lister'),
      ] }
    }
    return { reply: faq.answer, state: emptyState(), actions: faqActions }
  }

  // 12. House search (deterministic) — natural-language queries.
  const isSearchAsk = /(find|search|show|is there|do you have|any house|any homes|available houses|available homes|looking for|want|need a house|need a home|list houses|houses? (in|around|near|within))/.test(low)
  const isArea = AREA_WORDS.some((a) => low.includes(a))
  const isBedroom = BEDROOM_RE.test(low)
  const isRent = /(rent|budget)/.test(low)
  if (isSearchAsk || isArea || isBedroom || (isRent && /(house|home|room|apartment|bed|br|studio|bedsitter)/.test(low))) {
    const { cards, total, takenNote, snapshot } = await searchHouses(msg, 5)
    if (cards.length > 0) {
      const cardsActions: ChatAction[] = cards.map((c) => ({ type: 'card', card: c }))
      const more = total > cards.length ? `\n\nSay *show more* and I'll send the next ${Math.min(snapshot.pageSize, total - cards.length)}.` : ''
      const rentLine = total > cards.length ? `I found ${total} matching house${total === 1 ? '' : 's'} — here are the top ${cards.length}:` : `I found ${cards.length} matching house${cards.length === 1 ? '' : 's'}:`
      return {
        reply: `${rentLine}\n${takenNote ? `\n${takenNote}` : ''}${more}\n\n---\n\nTap a card to open the full listing.`,
        actions: cardsActions,
        state: { ...prevState, search: snapshot },
      }
    }
    // No results — offer a house request in natural bubbles.
    const q = parseHouseQuery(msg)
    const described = [q.locations.join(', '), q.bedrooms.join(', '), q.rent.max ? `under KSh ${q.rent.max.toLocaleString()}` : q.sort === 'price_asc' ? 'lowest price first' : ''].filter(Boolean).join(' · ')
    return {
      reply: `Sorry — I couldn't find any *available* houses matching "${msg}".\n\n---\n\n${described ? `You searched for: ${described}.\n\nThe closest I could find were outside your budget or in a different area.` : `I searched the area but nothing came up.`}\n\n---\n\nWant me to submit a *house request* instead? Our team will hunt for it and reach you on WhatsApp.`,
      state: { ...prevState, search: snapshot },
    }
  }

  // 13. Shortcut links.
  const linkKey = Object.keys(PAGE_LINKS).find((k) => {
    if (k === 'home') return /\b(home|homepage|front page|main page)\b/.test(low)
    if (k === 'listings') return /(all listings|listings page|browse houses|browse homes)/.test(low)
    if (k === 'upload') return /(upload|list a house|add listing)/.test(low)
    if (k === 'bookings') return /(my bookings|my booking|bookings page)/.test(low)
    if (k === 'taken') return /(taken page|taken houses page)/.test(low)
    if (k === 'signup') return /(sign ?up|register|create account|join)/.test(low)
    if (k === 'signin') return /(sign ?in|log ?in|login)/.test(low)
    if (k === 'favorites') return /(favorites|favourite|saved homes)/.test(low)
    return low.includes(k)
  })
  if (linkKey) {
    const page = PAGE_LINKS[linkKey]
    return { reply: `Here you go: *${page.label}*\n${page.href}`, state: emptyState(), actions: [linkAction(page.label, page.href)] }
  }

  // 14. Never guess and never say "I don't know yet" — hand off naturally.
  return {
    reply:
      `I'd rather get this right than guess 🙏\n\n` +
      `Our team can pick it up from here — tap below or message us on WhatsApp.\n\n` +
      `Is there anything else I can help with in the meantime?`,
    state: prevState.form ? prevState : emptyState(),
    actions: [linkAction('💬 Talk to the team', CONTACT_INFO.whatsapp), linkAction('🏠 Browse houses', PAGE_LINKS.listings.href)],
  }
}

function linkAction(label: string, href: string): ChatAction {
  return { type: 'link', label, href }
}

/** Pull a listing id out of a pasted listing link or a bare UUID. */
function extractListingId(text: string): string | null {
  const link = text.match(/\/listings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (link) return link[1]
  const bare = text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i)
  return bare ? bare[1] : null
}

// Kept for callers that previously imported the helper from the engine.
export { toolSearchHouses } from './tools'
