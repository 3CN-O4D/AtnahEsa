import type { ChatRequest, ChatResponse, ChatState, ChatAction } from './types'
import { emptyState } from './types'
import { FAQ, PAGE_LINKS, CONTACT_INFO, WIFI_REQUIREMENTS } from './knowledge'
import { searchHouses, parseHouseQuery } from './houseSearch'
import { toolStats, toolWifiPackages, toolMovers, toolContact, toolGetHouse } from './tools'
import { aiChat, aiEnabled } from './ai'
import { createHandoff } from './handoff'

const AREA_WORDS = [
  'kipkaren', 'anex', 'annex', 'langas', 'kapsoya', 'pioneer', 'kokwas', 'juniorate', 'juniors',
  'eldoret', 'nairobi', 'mombasa', 'kisumu', 'westlands', 'nyali', 'mtwapa', 'kileleshwa', 'milimani',
  'kilimani', 'south b', 'karen', 'runda', 'nyayo', 'kapseret', 'huruma', 'moi university', 'itigo', 'baringo', 'kokwet', 'mega',
]

const BEDROOM_RE = /\b(?:bedsitter|studio|bungalow|townhouse|apartment|1\s?br|2\s?br|3\s?br|4\s?br|one\s*bedroom|two\s*bedroom|three\s*bedroom)\b/i

const CANCEL_RE = /^(cancel|stop|never ?mind|nevermind|forget it|abort|exit|quit|hapana|acha)\b/i

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

  // 3. A pasted listing link or listing id — fetch that exact house, with its
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

  // 5. AI-first. The model chats naturally, calls tools in the background and
  // collects submissions from a declared field spec. It is the only driver of
  // multi-turn conversations; there are no step machines.
  if (aiEnabled()) {
    const ai = await aiChat(history, msg, prevState)
    if (ai && ai.reply) {
      const cardActions: ChatAction[] = (ai.cards ?? []).slice(0, 5).map((c) => ({ type: 'card', card: c }))
      const actions = [...(ai.actions ?? []), ...cardActions]
      const keepDraft = Boolean(prevState.form) || Object.keys(prevState.draft ?? {}).length > 0
      const state = ai.state ? { ...prevState, ...ai.state } : keepDraft ? prevState : emptyState()
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
    // No results — offer a house request in natural bubbles.
    const q = parseHouseQuery(msg)
    const described = [q.locations.join(', '), q.bedrooms.join(', '), q.rent.max ? `under KSh ${q.rent.max.toLocaleString()}` : ''].filter(Boolean).join(' · ')
    return {
      reply: `Sorry — I couldn't find any *available* houses matching "${msg}".\n\n---\n\n${described ? `You searched for: ${described}.\n\nThe closest I could find were outside your budget or in a different area.` : `I searched the area but nothing came up.`}\n\n---\n\nWant me to submit a *house request* instead? Our team will hunt for it and reach you on WhatsApp.`,
      state: emptyState(),
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
