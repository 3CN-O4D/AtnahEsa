import type { ChatRequest, ChatResponse, ChatState, ChatAction } from './types'
import { emptyState } from './types'
import { FAQ, PAGE_LINKS, CONTACT_INFO, WIFI_REQUIREMENTS } from './knowledge'
import { searchHouses, parseHouseQuery } from './houseSearch'
import { toolStats, toolSearchHouses, toolGetHouse, toolWifiPackages, toolMovers, toolContact } from './tools'
import { startHouseRequest, continueHouseRequest, startWifiBooking, continueWifiBooking, startMoverRequest, continueMoverRequest, startPasswordReset, continuePasswordReset, startChangeEmail, continueChangeEmail, startDeleteAccount, continueDeleteAccount, startChangeDP, continueDeleteDP, isCancelMessage } from './flows'
import { aiChat, aiEnabled } from './ai'
import { createHandoff } from './handoff'

const AREA_WORDS = [
  'kipkaren', 'anex', 'annex', 'langas', 'kapsoya', 'pioneer', 'kokwas', 'juniorate', 'juniors',
  'eldoret', 'nairobi', 'mombasa', 'kisumu', 'westlands', 'nyali', 'mtwapa', 'kileleshwa', 'milimani',
  'kilimani', 'south b', 'karen', 'runda', 'nyayo', 'kapseret', 'huruma', 'moi university', 'itigo', 'baringo', 'kokwet', 'mega',
]

const BEDROOM_RE = /\b(?:bedsitter|studio|bungalow|townhouse|apartment|1\s?br|2\s?br|3\s?br|4\s?br|one\s*bedroom|two\s*bedroom|three\s*bedroom)\b/i

const FALLBACK_REPLY =
  `Hmm, I'm not sure about that one yet 🙈\n\nI'm still learning, but I can help you find houses, show stats, help with WiFi or movers, explain escrow, or get you in touch with the team.\n\nWhat would you like?`

/**
 * Account-changing flows need the browser's signed-in session, which the
 * WhatsApp bridge does not have. Match both a fresh intent and an already
 * active flow so the chat never gets stuck waiting for an OTP it can't use.
 */
const WHATSAPP_WEB_INTENTS: { re: RegExp; what: string }[] = [
  { re: /\b(change ?dp|change ?avatar|profile ?picture|update ?avatar|new ?profile ?picture|remove ?dp|delete ?dp)\b/, what: 'your profile picture' },
  { re: /\b(change ?email|update ?email|new email|different email)\b/, what: 'your account email' },
  { re: /\b(delete ?account|remove ?account|deactivate ?account|close ?account)\b/, what: 'your account' },
]

function whatsappBlockedIntent(state: ChatState, low: string): string | null {
  const active =
    state.mode === 'change_dp' || state.mode === 'change_email' || state.mode === 'delete_account'
      ? state.mode
      : null
  const hit = WHATSAPP_WEB_INTENTS.find((i) => i.re.test(low)) ?? null
  if (!active && !hit) return null

  const what =
    active === 'change_dp'
      ? 'your profile picture'
      : active === 'delete_account'
        ? 'your account'
        : active === 'change_email'
          ? 'your account email'
          : hit!.what

  return `🔐 I can't change ${what} from WhatsApp — that needs a signed-in browser session for security.\n\nOpen https://www.asehanta.com/profile while signed in and do it there.\n\nAnything else I can help with?`
}

export async function handleChat(input: ChatRequest): Promise<ChatResponse> {
  const msg = (input.message || '').trim().slice(0, 600)
  const prevState: ChatState = { ...emptyState(), ...(input.state ?? {}) }
  const history = Array.isArray(input.history) ? input.history.slice(-12) : []

  // 1. Cancel / abort an in-progress flow.
  if (prevState.mode !== 'chat' && prevState.step && isCancelMessage(msg)) {
    return {
      reply: `Okay, I've cancelled that. Is there anything else I can help with? 🙂`,
      state: emptyState(),
    }
  }

  // 2. Continue an active guided flow.
  if (prevState.mode === 'house_request' && prevState.step) {
    return continueHouseRequest(prevState, msg)
  }
  if (prevState.mode === 'wifi_booking' && prevState.step) {
    return continueWifiBooking(prevState, msg)
  }
  if (prevState.mode === 'mover_request' && prevState.step) {
    return continueMoverRequest(prevState, msg)
  }
  if (prevState.mode === 'password_reset' && prevState.step) {
    return continuePasswordReset(prevState, msg)
  }
  if (prevState.mode === 'change_email' && prevState.step) {
    return continueChangeEmail(prevState, msg)
  }
  if (prevState.mode === 'delete_account' && prevState.step) {
    return continueDeleteAccount(prevState, msg)
  }
  if (prevState.mode === 'change_dp' && prevState.step) {
    return continueDeleteDP(prevState, msg)
  }

  const low = msg.toLowerCase()

  // 2b. WhatsApp can't touch the logged-in account: the bridge has no browser
  // session. Send those intents to the website instead of letting the cookie
  // flow fail with "not signed in".
  if (input.channel === 'whatsapp') {
    const blocked = whatsappBlockedIntent(prevState, low)
    if (blocked) return { reply: blocked, state: emptyState() }
  }

  // 3. Guided-flow STARTS — exact intents that need the state-machine wizard.
  // Check these BEFORE AI so the AI can't intercept and give text instructions instead.
  if (/\b(change ?dp|change ?avatar|profile ?picture|update ?avatar|new ?profile ?picture)\b/.test(low)) {
    return startChangeDP()
  }
  if (/\b(request a house|house request|submit a request|make a request|submit a house request|let me request|log a request)\b/.test(low)) {
    return startHouseRequest()
  }
  if (/\b(book wifi|arrange wifi|wifi booking|sign up for wifi|sign me up for wifi|subscribe to wifi|order wifi|get wifi installed|install wifi for me)\b/.test(low)) {
    return startWifiBooking()
  }
  if (/\b(request a mover|need a mover|arrange a mover|book a mover|help me move|get a mover|moving company|hire movers?|request movers?)\b/.test(low)) {
    return startMoverRequest()
  }
  if (/\b(forgot ?password|reset ?password|change ?password|password ?reset|forgotten password|can't ?login|cannot ?login|unable to ?sign ?in|lock ?out|reset my ?password)\b/.test(low)) {
    return startPasswordReset()
  }
  if (/\b(change ?email|update ?email|new email|different email)\b/.test(low)) {
    return startChangeEmail()
  }
  if (/\b(delete ?account|remove ?account|deactivate ?account|close ?account)\b/.test(low)) {
    return startDeleteAccount()
  }

  // 3b. A pasted listing link or listing id — fetch that exact house, with its
  // photos. Works even when the AI is off, and never invents listing data.
  const listingId = extractListingId(msg)
  if (listingId) {
    const house = await toolGetHouse(listingId)
    return {
      reply: house.text,
      actions: house.cards?.length ? [{ type: 'card', card: house.cards[0] }] : [linkAction('🏠 Open listing', `https://www.asehanta.com/listings/${listingId}`)],
      state: emptyState(),
    }
  }

  // 3c. WhatsApp → website hand-off. The user wants to continue in a browser
  // (better for forms, uploads and payments); mint a single-use token that
  // carries this chat's state and history to /chat.
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

  // 4. AI-first — the model thinks, calls its tools in the background, then
  // formats a human reply. Deterministic rules below act as fallback when AI
  // is off or down.
  if (aiEnabled()) {
    const ai = await aiChat(history, msg)
    if (ai && ai.reply) {
      const actions: ChatAction[] = (ai.cards ?? []).slice(0, 5).map((c) => ({ type: 'card', card: c }))
      return { reply: ai.reply, actions: actions.length ? actions : undefined, state: emptyState(), adminAlert: ai.adminAlert }
    }
  }

  // 5. Greetings / social chat (deterministic fallback, works without AI).
  if (/^(hi|hello|hey|heyy|hey there|hiya|yo|sup|habari|jambo|mambo|howdy|sasa|mzuri|poa|good\s*(morning|afternoon|evening)|morning|afternoon|evening)\b/i.test(msg) && msg.length < 50) {
    const greetings = [
      "Hi there 👋",
      "Hey 😊",
      "Hello! 👋",
      "Hi! How's it going?",
    ]
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

  // 6. Statistics.
  if (/how many|stats|statistics|counts?|how many houses|numbers?|market data|current (listings|houses|users)/.test(low)) {
    const stats = await toolStats()
    return { reply: stats.text, state: emptyState(), actions: [linkAction('📊 View full stats', PAGE_LINKS.stats.href)] }
  }

  // 7a. WiFi requirements — answer "what do I need?" instead of dumping plans.
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

  // 7b. WiFi packages.
  if (/\b(wifi|internet|router|wifi package|packages)\b/.test(low)) {
    const res = await toolWifiPackages()
    return { reply: res.text, state: emptyState(), actions: [linkAction('📶 Browse WiFi page', PAGE_LINKS.wifi.href)] }
  }

  // 8. Movers.
  if (/\b(mover|movers|moving)\b/.test(low)) {
    const res = await toolMovers()
    return { reply: res.text, state: emptyState(), actions: [linkAction('🚚 Browse movers', PAGE_LINKS.movers.href)] }
  }

  // 9. Contact details.
  if (/\b(contact|phone number|email|reach you|talk to|call us|support|whatsapp|address|location|office)\b/.test(low) && !/contact page/.test(low)) {
    const c = toolContact()
    return { reply: c.text, state: emptyState(), actions: [linkAction('💬 WhatsApp us', CONTACT_INFO.whatsapp), linkAction('📞 Contact page', PAGE_LINKS.contact.href)] }
  }

  // 10. Terms / escrow / refunds / payments (knowledge base).
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

  // 11. House search (deterministic) — this handles natural-language queries.
  const isSearchAsk = /(find|search|show|is there|do you have|any house|any homes|available houses|available homes|looking for|want|need a house|need a home|list houses|houses? (in|around|near|within))/.test(low)
  const isArea = AREA_WORDS.some((a) => low.includes(a))
  const isBedroom = BEDROOM_RE.test(low)
  const isRent = /(rent|budget)/.test(low)
  if (isSearchAsk || isArea || isBedroom || (isRent && /(house|home|room|apartment|bed|br|studio|bedsitter)/.test(low))) {
    const { cards, total, takenNote } = await searchHouses(msg, 5)
    if (cards.length > 0) {
      const cardsActions: ChatAction[] = cards.map((c) => ({ type: 'card', card: c }))
      const rentLine = total > cards.length ? `I found ${total} matching house${total === 1 ? '' : 's'} — here are the top ${cards.length}:` : `I found ${cards.length} matching house${cards.length === 1 ? '' : 's'}:`
      return {
        reply: `${rentLine}\n${takenNote ? `\n${takenNote}` : ''}\n\n---\n\nTap a card to open the full listing.`,
        actions: cardsActions,
        state: emptyState(),
      }
    }
    // No results — offer to submit a request in three human bubbles.
    const q = parseHouseQuery(msg)
    const described = [q.locations.join(', '), q.bedrooms.join(', '), q.rent.max ? `under KSh ${q.rent.max.toLocaleString()}` : ''].filter(Boolean).join(' · ')
    return {
      reply: `Sorry — I couldn't find any *available* houses matching "${msg}".\n\n---\n\n${described ? `You searched for: ${described}.\n\nThe closest I could find were outside your budget or in a different area.` : `I searched the area but nothing came up.`}\n\n---\n\nWant me to submit a *house request* instead? Our team will hunt for it and reach you on WhatsApp.`,
      state: emptyState(),
    }
  }

  // 12. Shortcut links.
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

  // 13. Fallback.
  return { reply: FALLBACK_REPLY, state: emptyState() }
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

// Re-export helper used by the API route for defaults.
export { toolSearchHouses }

/** Detects house-search intent so we can offer a request flow when no results. */
function isHouseSearchIntent(text: string): boolean {
  const isSearchAsk = /(find|search|show|is there|do you have|any house|any homes|available houses|available homes|looking for|want|need a house|need a home|list houses|houses? (in|around|near|within))/.test(text)
  const isArea = AREA_WORDS.some((a) => text.includes(a))
  const isBedroom = BEDROOM_RE.test(text)
  const isRent = /(rent|budget)/.test(text)
  return isSearchAsk || isArea || isBedroom || (isRent && /(house|home|room|apartment|bed|br|studio|bedsitter)/.test(text))
}