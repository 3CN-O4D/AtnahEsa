import type { ChatRequest, ChatResponse, ChatState, ChatAction } from './types'
import { emptyState } from './types'
import { FAQ, PAGE_LINKS, CONTACT_INFO, WIFI_REQUIREMENTS } from './knowledge'
import { searchHouses, parseHouseQuery } from './houseSearch'
import { toolStats, toolSearchHouses, toolWifiPackages, toolMovers, toolContact } from './tools'
import { startHouseRequest, continueHouseRequest, startWifiBooking, continueWifiBooking, startMoverRequest, continueMoverRequest, isCancelMessage } from './flows'
import { aiChat, aiEnabled } from './ai'
import { QUICK_START } from './messages'

const AREA_WORDS = [
  'kipkaren', 'anex', 'annex', 'langas', 'kapsoya', 'pioneer', 'kokwas', 'juniorate', 'juniors',
  'eldoret', 'nairobi', 'mombasa', 'kisumu', 'westlands', 'nyali', 'mtwapa', 'kileleshwa', 'milimani',
  'kilimani', 'south b', 'karen', 'runda', 'nyayo', 'kapseret', 'huruma', 'moi university', 'itigo', 'baringo', 'kokwet', 'mega',
]

const BEDROOM_RE = /\b(?:bedsitter|studio|bungalow|townhouse|apartment|1\s?br|2\s?br|3\s?br|4\s?br|one\s*bedroom|two\s*bedroom|three\s*bedroom)\b/i

const FALLBACK_REPLY =
  `Hmm, I'm not sure about that one yet 🙈\n\nI'm still learning, but I can help you find houses, show stats, help with WiFi or movers, explain escrow, or get you in touch with the team.\n\nWhat would you like?`

export async function handleChat(input: ChatRequest): Promise<ChatResponse> {
  const msg = (input.message || '').trim().slice(0, 600)
  const prevState: ChatState = { ...emptyState(), ...(input.state ?? {}) }
  const history = Array.isArray(input.history) ? input.history.slice(-12) : []

  // 1. Cancel / abort an in-progress flow.
  if (prevState.mode !== 'chat' && prevState.step && isCancelMessage(msg)) {
    return {
      reply: `Okay, I've cancelled that. Is there anything else I can help with? 🙂`,
      state: emptyState(),
      quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
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

  const low = msg.toLowerCase()

  // 3. Guided-flow STARTS — exact intents that need the state-machine wizard.
  if (/\b(request a house|house request|submit a request|make a request|submit a house request|let me request|log a request)\b/.test(low)) {
    return startHouseRequest()
  }
  if (/\b(book wifi|arrange wifi|wifi booking|sign up for wifi|sign me up for wifi|subscribe to wifi|order wifi|get wifi installed|install wifi for me)\b/.test(low)) {
    return startWifiBooking()
  }
  if (/\b(request a mover|need a mover|arrange a mover|book a mover|help me move|get a mover|moving company|hire movers?|request movers?)\b/.test(low)) {
    return startMoverRequest()
  }

  // 4. AI-first — DeepSeek thinks, calls its tools in the background (house
  // search, stats, wifi, movers, contact...), then formats a human reply.
  // The deterministic rules below act as a fallback when AI is off or down.
  if (aiEnabled()) {
    const ai = await aiChat(history, msg)
    if (ai && ai.reply) {
      const actions: ChatAction[] = (ai.cards ?? []).slice(0, 5).map((c) => ({ type: 'card', card: c }))
      return { reply: ai.reply, actions: actions.length ? actions : undefined, state: emptyState(), quickReplies: quickStart() }
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
      reply: `${pick}\n\nHow can I be of help today?\n\nHere's what I can do:\n🏠 Find you a house\n📝 Request a house for you\n📊 Show you our stats\n📶 Help with WiFi packages\n🚚 Arrange a mover\n📄 Explain escrow & terms\n📞 Get you in touch with our team\n\nJust ask 🙂`,
      state: emptyState(),
      quickReplies: QUICK_START,
    }
  }
  if (/\b(how are you|hows you|how's it going|how you doing|you good|all good)\b/i.test(low) && msg.length < 60) {
    return {
      reply: `I'm good, thanks for asking 😊\n\nHow about you? Anything I can help with today?\n\n🏠 Find a house\n📊 Stats\n📶 WiFi packages\n🚚 Movers\n📄 Terms & escrow\n📞 Contact`,
      state: emptyState(),
      quickReplies: QUICK_START,
    }
  }
  if (/\b(thanks|thank you|asante|asante sana|nice|awesome|cool|great|perfect)\b/.test(low) && msg.length < 60) {
    return { reply: `You're most welcome! 😊 Anything else I can do for you?`, state: emptyState(), quickReplies: QUICK_START }
  }
  if (/^(help|what can you do|how can you help|menu|options)\b/.test(low)) {
    const greetings = ["Hi there 👋", "Hey 😊", "Hello! 👋", "Hi! How's it going?"]
    const pick = greetings[Math.floor(Math.random() * greetings.length)]
    return {
      reply: `${pick}\n\nHere's what I can do:\n🏠 Find you a house\n📝 Request a house for you\n📊 Show you our stats\n📶 Help with WiFi packages\n🚚 Arrange a mover\n📄 Explain escrow & terms\n📞 Get you in touch with our team\n\nJust ask 🙂`,
      state: emptyState(),
      quickReplies: QUICK_START,
    }
  }

  // 6. Statistics.
  if (/how many|stats|statistics|counts?|how many houses|numbers?|market data|current (listings|houses|users)/.test(low)) {
    const stats = await toolStats()
    return { reply: stats.text, state: emptyState(), actions: [linkAction('📊 View full stats', PAGE_LINKS.stats.href)], quickReplies: quickStart() }
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
      quickReplies: ['📶 Book a WiFi package'],
    }
  }

  // 7b. WiFi packages.
  if (/\b(wifi|internet|router|wifi package|packages)\b/.test(low)) {
    const res = await toolWifiPackages()
    return { reply: res.text, state: emptyState(), actions: [linkAction('📶 Browse WiFi page', PAGE_LINKS.wifi.href)], quickReplies: ['📶 Book a WiFi package'] }
  }

  // 8. Movers.
  if (/\b(mover|movers|moving)\b/.test(low)) {
    const res = await toolMovers()
    return { reply: res.text, state: emptyState(), actions: [linkAction('🚚 Browse movers', PAGE_LINKS.movers.href)], quickReplies: ['🚚 Request a mover'] }
  }

  // 9. Contact details.
  if (/\b(contact|phone number|email|reach you|talk to|call us|support|whatsapp|address|location|office)\b/.test(low) && !/contact page/.test(low)) {
    const c = toolContact()
    return { reply: c.text, state: emptyState(), actions: [linkAction('💬 WhatsApp us', CONTACT_INFO.whatsapp), linkAction('📞 Contact page', PAGE_LINKS.contact.href)], quickReplies: quickStart() }
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
      ], quickReplies: ['How does escrow work?', 'What about refunds?', '🏠 Find me a house'] }
    }
    return { reply: faq.answer, state: emptyState(), actions: faqActions, quickReplies: quickStart() }
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
        reply: `${rentLine}\n${takenNote ? `\n${takenNote}` : ''}\n\nTap a card to open the full listing.`,
        actions: cardsActions,
        state: emptyState(),
        quickReplies: ['📝 Request a house', '📶 WiFi packages'],
      }
    }
    // No results — offer to submit a request.
    const q = parseHouseQuery(msg)
    const described = [q.locations.join(', '), q.bedrooms.join(', '), q.rent.max ? `under KSh ${q.rent.max.toLocaleString()}` : ''].filter(Boolean).join(' · ')
    return {
      reply: `Sorry — I couldn't find any *available* houses matching "${msg}".${described ? `\n\nYou searched for: ${described}` : ''}\n\nWant me to submit a *house request* instead? Our team will hunt for it and reach you on WhatsApp.`,
      state: emptyState(),
      quickReplies: ['📝 Yes, request a house', '🏠 Search something else'],
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
    return { reply: `Here you go: *${page.label}*\n${page.href}`, state: emptyState(), actions: [linkAction(page.label, page.href)], quickReplies: quickStart() }
  }

  // 13. Fallback.
  return { reply: FALLBACK_REPLY, state: emptyState(), quickReplies: quickStart() }
}

function quickStart(): string[] {
  return ['🏠 Find me a house', '📊 House stats', '📶 WiFi packages', '🚚 Movers', '📄 Terms & escrow', '📞 Contact']
}

function linkAction(label: string, href: string): ChatAction {
  return { type: 'link', label, href }
}

// Re-export helper used by the API route for defaults.
export { toolSearchHouses }
