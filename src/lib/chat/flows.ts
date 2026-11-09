import { createAdminClient } from '@/lib/supabase/admin'
import { findAuthUserByEmail } from '@/lib/supabase/admin-users'
import { notifyAdmins } from '@/lib/notify'
import { WIFI_INSTALLATION_FEE, WHATSAPP_NUMBER } from '@/lib/constants'
import { sendOtpEmail } from '@/lib/email'
import { isValidPhone, parseWhatsAppContact, canonicalWhatsAppContact, getWhatsAppLink } from '@/lib/whatsapp'
import { findValidOtp, recordOtpFailure } from '@/lib/otp'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractRentRange } from './houseSearch'
import { toolWifiPackages } from './tools'
import type { ChatAction, ChatState } from './types'
import { randomInt } from 'crypto'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface FlowStepResult {
  reply: string
  actions?: ChatAction[]
  quickReplies?: string[]
  state: ChatState
  /** True when the flow completed and the draft was submitted. */
  done?: boolean
}

export function isCancelMessage(msg: string): boolean {
  return /^(cancel|stop|quit|exit|start over|restart|forget it|never mind|abort)\b/i.test(msg.trim())
}

export function isConfirmMessage(msg: string): boolean {
  return /^(yes|yeah|yep|ok|okay|submit|confirm|go ahead|send it|proceed|correct|that's right|thats right|sure|done)\b/i.test(msg.trim()) || /^(yes|ok|okay|submit|confirm|go ahead|proceed)\b/i.test(msg.trim())
}

export function isRejectMessage(msg: string): boolean {
  return /^(no|nope|nah|cancel|don't|dont|stop|start over|wrong|not that)\b/i.test(msg.trim())
}

function setStep(state: ChatState, step: string, reply: string, quickReplies?: string[]): FlowStepResult {
  return { reply, quickReplies, state: { ...state, mode: 'house_request', step } }
}

// ---------------------------------------------------------------- house request

const HOUSE_REQUEST_STEPS: Record<string, { ask: string; quick?: string[] }> = {
  name: { ask: `Great — let's set up your house request. 🏠\n\nFirst, *what's your full name?*` },
  email: { ask: `Thanks! And your *email address*?` },
  phone: { ask: `Your *phone number*? (e.g. 0712 345 678)` },
  whatsapp: { ask: `What's your preferred *WhatsApp contact* for the team to reach you?\n\nJust say *"same"* to use your phone number, or give a number / @username.` },
  location: { ask: `Where would you like the house to be? E.g. *Kipkaren, Annex, Langas, Nairobi*…` },
  rent: { ask: `What's your *monthly budget*?\n\nReply like *"15k to 25k"*, *"under 12k"*, or *"any"*.` , quick: ['any'] },
  preferences: { ask: `Which *house type(s)* interest you?\n\nE.g. *bedsitter, studio, 1BR, 2BR, 3BR*… (or *"any"*).\n\nAfter that, mention water/token if you care, e.g. *"2BR, water included, self-contained"*.`, quick: ['any'] },
  description: { ask: `Anything else we should know? (quiet area, parking, near town…)\n\nReply *"none"* to skip.`, quick: ['none'] },
}

const DESIGN_IDS: Array<{ id: string; re: RegExp }> = [
  { id: 'bedsitter', re: /\bbedsitter\b/i },
  { id: 'studio', re: /\bstudio\b/i },
  { id: '1br', re: /\b1\s?br\b|\bone\s*bedroom\b/i },
  { id: '2br', re: /\b2\s?br\b|\btwo\s*bedroom\b/i },
  { id: '3br', re: /\b3\s?br\b|\bthree\s*bedroom\b/i },
  { id: 'bungalow', re: /\bbungalow\b/i },
  { id: 'apartment', re: /\bapartment\b/i },
  { id: 'townhouse', re: /\btownhouse\b/i },
]

function extractDesigns(text: string): string[] {
  return DESIGN_IDS.filter((d) => d.re.test(text)).map((d) => d.id)
}

function extractToken(text: string): string[] {
  if (/self[-\s]?contained/i.test(text)) return ['self']
  if (/\binclusive\b/i.test(text)) return ['inclusive']
  if (/\bopen\b|\beither\b/i.test(text)) return ['either']
  return []
}

function extractWater(text: string): string[] {
  if (/(water|rent)[^.]{0,20}(included|inclusive)|(included|inclusive)[^.]{0,20}rent/i.test(text)) return ['included']
  if (/own\s*borehole|borehole/i.test(text)) return ['own_borehole']
  if (/\beither\b/i.test(text)) return ['either']
  return []
}

export async function startHouseRequest(): Promise<FlowStepResult> {
  const state: ChatState = { mode: 'house_request', step: 'name', draft: {} }
  return setStep(state, 'name', HOUSE_REQUEST_STEPS.name.ask)
}

export async function continueHouseRequest(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'name'
  const set = (next: string, reply: string, quick?: string[]): FlowStepResult =>
    ({ reply, quickReplies: quick, state: { mode: 'house_request', step: next, draft } })

  if (step === 'name') {
    if (msg.trim().length < 2) return set('name', `Sorry, I didn't catch that. *What's your full name?*`)
    draft.name = msg.trim()
    return set('email', HOUSE_REQUEST_STEPS.email.ask)
  }

  if (step === 'email') {
    const email = msg.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return set('email', `That email doesn't look right — please try again (e.g. you@example.com).`)
    draft.email = email
    return set('phone', HOUSE_REQUEST_STEPS.phone.ask)
  }

  if (step === 'phone') {
    if (!isValidPhone(msg.trim())) return set('phone', `That phone number doesn't look right. Please use something like *0712 345 678*.`)
    draft.phone = msg.trim()
    return set('whatsapp', HOUSE_REQUEST_STEPS.whatsapp.ask)
  }

  if (step === 'whatsapp') {
    const input = msg.trim()
    if (input && !/^(same|default|use phone|use my phone|phone)$/i.test(input)) {
      const parsed = parseWhatsAppContact(input)
      if (!parsed) {
        return set('whatsapp', `Hmm, I couldn't read that contact. Use a phone number like *0712 345 678*, a username like *@janedoe*, or reply *"same"* to use your phone number.`)
      }
      draft.whatsapp = input
    } else {
      draft.whatsapp = draft.phone
    }
    return set('location', HOUSE_REQUEST_STEPS.location.ask)
  }

  if (step === 'location') {
    const loc = msg.trim()
    if (loc.length < 2) return set('location', `Please tell me the *area or town* you're looking in.`)
    draft.location = loc
    return set('rent', HOUSE_REQUEST_STEPS.rent.ask, HOUSE_REQUEST_STEPS.rent.quick)
  }

  if (step === 'rent') {
    const text = msg.trim()
    if (/^(any|no budget|none|skip|n\/a|flexible)$/i.test(text)) {
      draft.min_rent = null
      draft.max_rent = null
      return set('preferences', HOUSE_REQUEST_STEPS.preferences.ask, HOUSE_REQUEST_STEPS.preferences.quick)
    }
    const { min, max } = extractRentRange(text)
    if (min === null && max === null) {
      return set('rent', `I couldn't pick a budget from that. Try *"15k to 25k"*, *"under 12k"*, or *"any"*.`)
    }
    draft.min_rent = min
    draft.max_rent = max
    return set('preferences', HOUSE_REQUEST_STEPS.preferences.ask, HOUSE_REQUEST_STEPS.preferences.quick)
  }

  if (step === 'preferences') {
    const text = msg.trim()
    if (!/^(any|none|skip|either|open)/i.test(text)) {
      draft.house_designs = extractDesigns(text)
      draft.token_options = extractToken(text)
      draft.water_options = extractWater(text)
    } else {
      draft.house_designs = []
      draft.token_options = []
      draft.water_options = []
    }
    return set('description', HOUSE_REQUEST_STEPS.description.ask, HOUSE_REQUEST_STEPS.description.quick)
  }

  if (step === 'description') {
    const text = msg.trim()
    draft.description = /^(none|skip|n\/a|nothing)$/i.test(text) ? '' : text
    return { reply: buildHouseSummary(draft), quickReplies: ['Yes, submit it', 'No, start over'], state: { mode: 'house_request', step: 'confirm', draft } }
  }

  if (step === 'confirm') {
    if (isRejectMessage(msg) || /start over/i.test(msg)) {
      return { reply: `No problem — your draft is cleared. Is there anything else I can help with? 🙂`, state: { mode: 'chat', step: null, draft: {} } }
    }
    if (isConfirmMessage(msg)) {
      const res = await submitHouseRequest(draft)
      if (res.error) {
        return { reply: `Sorry, I couldn't submit that just now: ${res.error} Please try again in a moment.`, state: { mode: 'chat', step: null, draft: {} } }
      }
      return {
        reply: `✅ *Done! Your house request is in.*\n\nOur team will review it and reach you on WhatsApp (${(draft.whatsapp as string) || (draft.phone as string)}) within 24 hours.\n\nYou can also browse available houses now: https://www.asehanta.com`,
        state: { mode: 'chat', step: null, draft: {} },
        actions: [{ type: 'link', label: 'Browse houses', href: 'https://www.asehanta.com/' }],
        quickReplies: ['🏠 Find me a house now', '📶 WiFi packages'],
      }
    }
    return { reply: buildHouseSummary(draft) + `\n\nShall I submit this? Reply *yes* or *no*.`, quickReplies: ['Yes, submit it', 'No, start over'], state: { mode: 'house_request', step: 'confirm', draft } }
  }

  return startHouseRequest()
}

function buildHouseSummary(d: Record<string, unknown>): string {
  const rent = d.min_rent || d.max_rent
    ? `${d.min_rent ? `KSh ${(d.min_rent as number).toLocaleString()}` : 'Any'} — ${d.max_rent ? `KSh ${(d.max_rent as number).toLocaleString()}` : 'Any'}`
    : 'Any'
  const designs = (d.house_designs as string[] | undefined)?.length ? (d.house_designs as string[]).join(', ') : 'Any'
  const token = (d.token_options as string[] | undefined)?.length ? (d.token_options as string[]).join(', ') : 'Any'
  const water = (d.water_options as string[] | undefined)?.length ? (d.water_options as string[]).join(', ') : 'Any'
  return `*Confirm your house request*\n\n👤 Name: ${d.name}\n📧 Email: ${d.email}\n📱 Phone: ${d.phone}\n💬 WhatsApp: ${d.whatsapp}\n📍 Location: ${d.location}\n💰 Budget: ${rent}\n🏠 Type: ${designs}\n💧 Water: ${water}\n🔑 Token: ${token}\n📝 Notes: ${d.description || 'None'}\n\n_Everything correct?_`
}

async function submitHouseRequest(d: Record<string, unknown>): Promise<{ error?: string }> {
  const supabase = createAdminClient()
  const insert = {
    name: d.name,
    email: d.email,
    phone: d.phone,
    location: d.location,
    min_rent: d.min_rent ?? null,
    max_rent: d.max_rent ?? null,
    token_options: d.token_options ?? [],
    water_options: d.water_options ?? [],
    house_designs: d.house_designs ?? [],
    description: d.description ?? '',
    whatsapp: canonicalWhatsAppContact((d.whatsapp as string) || '') || (d.phone as string),
  }

  let { error } = await supabase.from('house_requests').insert(insert)
  if (error && /whatsapp/i.test(`${error.code || ''} ${error.message || ''}`)) {
    const { whatsapp: _w, ...rest } = insert
    ;({ error } = await supabase.from('house_requests').insert(rest))
  }
  if (error) return { error: error.message }

  const designLabels: Record<string, string> = { bedsitter: 'Bedsitter', studio: 'Studio', '1br': '1 Bedroom', '2br': '2 Bedroom', '3br': '3 Bedroom', bungalow: 'Bungalow', apartment: 'Apartment', townhouse: 'Townhouse' }
  const tokenLabels: Record<string, string> = { self: 'Self-contained', inclusive: 'Inclusive', either: 'Either' }
  const waterLabels: Record<string, string> = { included: 'Included', own_borehole: 'Own borehole', either: 'Either' }
  await notifyAdmins('New House Request', '🏠 New House Request (via Chatbot)', {
    Name: String(d.name),
    Email: String(d.email),
    Phone: String(d.phone),
    WhatsApp: String(d.whatsapp ?? d.phone),
    Location: String(d.location),
    'Rent Range': insert.min_rent || insert.max_rent ? `${insert.min_rent ? `KSh ${(insert.min_rent as number).toLocaleString()}` : 'Any'} — ${insert.max_rent ? `KSh ${(insert.max_rent as number).toLocaleString()}` : 'Any'}` : 'Not specified',
    'House Design': (insert.house_designs as string[]).length ? (insert.house_designs as string[]).map((x) => designLabels[x] || x).join(', ') : 'Not specified',
    Token: (insert.token_options as string[]).length ? (insert.token_options as string[]).map((x) => tokenLabels[x] || x).join(', ') : 'Not specified',
    Water: (insert.water_options as string[]).length ? (insert.water_options as string[]).map((x) => waterLabels[x] || x).join(', ') : 'Not specified',
    Description: String(insert.description ?? 'None'),
    Source: 'Chatbot',
  })
  return {}
}

// ----------------------------------------------------------------- wifi booking

export async function startWifiBooking(): Promise<FlowStepResult> {
  const state: ChatState = { mode: 'wifi_booking', step: 'package', draft: {} }
  const packages = await toolWifiPackages()
  const quick: string[] = []
  const actions: ChatAction[] = packages.cards?.slice(0, 6).map((c) => ({ type: 'link', label: c.title, href: `https://www.asehanta.com/wifi/${c.id}` })) ?? []
  return {
    reply: `Let's set up a *WiFi booking*. 📶\n\n${packages.text}\n\nInstallation is a one-time *KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}* (router free), done within 48hrs. You can pay before or after.\n\nYou'll need your full name, phone, installation area and national ID.\n\nTell me the *package name* you'd like (or browse them: https://www.asehanta.com/wifi).`,
    quickReplies: quick,
    actions,
    state: { mode: 'wifi_booking', step: 'package', draft: {} },
  }
}

const WIFI_STEPS: Record<string, { ask: string; quick?: string[] }> = {
  name: { ask: `Thanks! What's your *full name*?` },
  phone: { ask: `Your *phone number*? (e.g. 0712 345 678)` },
  area: { ask: `Which *area* will the WiFi be installed? (e.g. Kipkaren, Annex, Langas…)` },
  id_number: { ask: `Your *national ID number*?` },
}

export async function continueWifiBooking(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'package'
  const set = (next: string, reply: string, quick?: string[]): FlowStepResult =>
    ({ reply, quickReplies: quick, state: { mode: 'wifi_booking', step: next, draft } })

  if (step === 'package') {
    const name = msg.trim()
    if (!name || name.length < 2) return set('package', `Which *package* would you like? Reply with the package name, e.g. *"Home Lite"*.`)
    draft.package_name = name
    return set('name', WIFI_STEPS.name.ask)
  }
  if (step === 'name') {
    if (msg.trim().length < 2) return set('name', `What's your *full name*?`)
    draft.name = msg.trim()
    return set('phone', WIFI_STEPS.phone.ask)
  }
  if (step === 'phone') {
    if (!isValidPhone(msg.trim())) return set('phone', `That phone number doesn't look right. Please use something like *0712 345 678*.`)
    draft.phone = msg.trim()
    return set('area', WIFI_STEPS.area.ask)
  }
  if (step === 'area') {
    if (msg.trim().length < 2) return set('area', `Which *area* will the installation be in?`)
    draft.area = msg.trim()
    return set('id_number', WIFI_STEPS.id_number.ask)
  }
  if (step === 'id_number') {
    const id = msg.trim().replace(/\D/g, '')
    if (id.length < 5) return set('id_number', `That ID doesn't look right — please enter your *national ID number* (digits only).`)
    draft.id_number = id
    return {
      reply: `*Confirm your WiFi booking*\n\n📶 Package: ${draft.package_name}\n👤 Name: ${draft.name}\n📱 Phone: ${draft.phone}\n📍 Area: ${draft.area}\n🪪 ID: ${id}\n\nInstallation fee is *KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}* (one-time) plus the monthly package price.`,
      quickReplies: ['Yes, submit it', 'No, start over'],
      state: { mode: 'wifi_booking', step: 'confirm', draft },
    }
  }
  if (step === 'confirm') {
    if (isRejectMessage(msg)) {
      return { reply: `No problem — cancelled. Anything else I can help with? 🙂`, state: { mode: 'chat', step: null, draft: {} } }
    }
    if (isConfirmMessage(msg)) {
      const res = await submitWifiBooking(draft)
      if (res.error) return { reply: `Sorry, I couldn't submit that: ${res.error}`, state: { mode: 'chat', step: null, draft: {} } }
      return {
        reply: `✅ *WiFi booking sent!*\n\nOur team will call you on ${draft.phone} to arrange installation in ${draft.area}.\n\nFirst payment will be about *KSh ${res.total.toLocaleString()}* (installation + first month).`,
        actions: [{ type: 'link', label: 'Browse WiFi packages', href: 'https://www.asehanta.com/wifi' }],
        quickReplies: ['🏠 Find me a house', '🚚 I need a mover'],
        state: { mode: 'chat', step: null, draft: {} },
      }
    }
    return { reply: `Shall I submit this WiFi booking? Reply *yes* or *no*.`, quickReplies: ['Yes, submit it', 'No, start over'], state: { mode: 'wifi_booking', step: 'confirm', draft } }
  }
  return startWifiBooking()
}

async function submitWifiBooking(d: Record<string, unknown>): Promise<{ error?: string; total: number }> {
  const supabase = createAdminClient()
  const totalPrice = WIFI_INSTALLATION_FEE
  const insert = {
    package_id: null,
    package_name: d.package_name,
    package_speed: '',
    package_price: 0,
    installation_fee: WIFI_INSTALLATION_FEE,
    total_price: totalPrice,
    name: d.name,
    phone: d.phone,
    area: d.area,
    id_number: d.id_number,
  }
  let { error } = await supabase.from('wifi_bookings').insert(insert)
  // Older databases may not have the fee columns yet — insert without them and
  // the defaults (or the migration) fill in the fee.
  if (error && /installation_fee|total_price/i.test(`${error.code || ''} ${error.message || ''}`)) {
    const { installation_fee: _fee, total_price: _total, ...base } = insert
    ;({ error } = await supabase.from('wifi_bookings').insert(base))
  }
  if (error) return { error: error.message, total: totalPrice }
  await notifyAdmins('WIFI NEEDED', 'WiFi Booking (via Chatbot)', {
    Name: String(d.name),
    Phone: String(d.phone),
    Area: String(d.area),
    'ID Number': String(d.id_number),
    Package: String(d.package_name),
    'Installation Fee': `KSh ${WIFI_INSTALLATION_FEE.toLocaleString()}`,
    Source: 'Chatbot',
  })
  return { total: totalPrice }
}

// --------------------------------------------------------------- mover request

export async function startMoverRequest(): Promise<FlowStepResult> {
  const state: ChatState = { mode: 'mover_request', step: 'name', draft: {} }
  return {
    reply: `Let's set up a *mover request*. 🚚\n\nFirst, *what's your full name?*`,
    state,
  }
}

const MOVER_STEPS: Record<string, { ask: string }> = {
  name: { ask: `What's your *full name*?` },
  phone: { ask: `Thanks! Your *phone number*? (e.g. 0712 345 678)` },
  details: { ask: `Where are you moving *from* and *to*?\n\nE.g. *"from Langas to Kipkaren"*, or *"anywhere within Eldoret"*.` },
  mover: { ask: `Any *preferred mover*? Reply the mover's name, or *"any"* and we'll arrange the best available.` },
  date: { ask: `When are you planning to *move*? (e.g. *next Saturday* or *this month*). Reply *"anytime"* if unsure.` },
}

export async function continueMoverRequest(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'name'
  const set = (next: string, reply: string): FlowStepResult => ({ reply, state: { mode: 'mover_request', step: next, draft } })

  if (step === 'name') {
    if (msg.trim().length < 2) return set('name', `What's your *full name*?`)
    draft.name = msg.trim()
    return set('phone', MOVER_STEPS.phone.ask)
  }
  if (step === 'phone') {
    if (!isValidPhone(msg.trim())) return set('phone', `That phone number doesn't look right. Please use something like *0712 345 678*.`)
    draft.phone = msg.trim()
    return set('details', MOVER_STEPS.details.ask)
  }
  if (step === 'details') {
    draft.details = msg.trim()
    return set('mover', MOVER_STEPS.mover.ask)
  }
  if (step === 'mover') {
    draft.mover = msg.trim()
    return set('date', MOVER_STEPS.date.ask)
  }
  if (step === 'date') {
    draft.date = msg.trim()
    return {
      reply: `*Confirm your mover request*\n\n👤 Name: ${draft.name}\n📱 Phone: ${draft.phone}\n📍 Move: ${draft.details}\n🚚 Mover: ${draft.mover}\n📅 When: ${draft.date}\n\nShall I hand this to our team on WhatsApp?`,
      quickReplies: ['Yes, continue on WhatsApp', 'No, start over'],
      state: { mode: 'mover_request', step: 'confirm', draft },
    }
  }
  if (step === 'confirm') {
    if (isRejectMessage(msg)) {
      return { reply: `No problem — cancelled. Anything else I can help with? 🙂`, state: { mode: 'chat', step: null, draft: {} } }
    }
    if (isConfirmMessage(msg)) {
      const summary = `Hi AseHanta, I'd like a mover. 👤 ${draft.name} | 📱 ${draft.phone} | Move: ${draft.details} | Mover: ${draft.mover} | When: ${draft.date}`
      const wa = getWhatsAppLink(WHATSAPP_NUMBER, summary)
      await notifyAdmins('MOVER REQUEST', 'Mover Request (via Chatbot)', {
        Name: String(draft.name),
        Phone: String(draft.phone),
        'Move Details': String(draft.details),
        Mover: String(draft.mover),
        When: String(draft.date),
        Source: 'Chatbot',
      })
      return {
        reply: `Done! ✅ Tap below to open WhatsApp so our team can arrange your mover.\n\nOr browse verified movers here: https://www.asehanta.com/movers`,
        actions: wa ? [{ type: 'link', label: '💬 Continue on WhatsApp', href: wa }] : undefined,
        quickReplies: ['🏠 Find me a house', '📶 WiFi packages'],
        state: { mode: 'chat', step: null, draft: {} },
      }
    }
    return { reply: `Shall I hand this to our team on WhatsApp? Reply *yes* or *no*.`, quickReplies: ['Yes, continue on WhatsApp', 'No, start over'], state: { mode: 'mover_request', step: 'confirm', draft } }
  }
  return startMoverRequest()
}

// --------------------------------------------------------------- password reset

export function startPasswordReset(): FlowStepResult {
  const state: ChatState = { mode: 'password_reset', step: 'email', draft: {} }
  return {
    reply: `🔐 *Password Reset*\n\nI can help you reset your password. First, *what's the email address* on your AseHanta account?`,
    state,
    quickReplies: ['Cancel'],
  }
}

export async function continuePasswordReset(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'email'
  const set = (next: string, reply: string, quickReplies?: string[], actions?: { type: 'link'; label: string; href: string }[]): FlowStepResult =>
    ({ reply, quickReplies, actions, state: { mode: 'password_reset', step: next, draft } })

  if (step === 'email') {
    const email = msg.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return set('email', `That email doesn't look right — please try again (e.g. you@example.com).`)
    }

    // Rate limit: max 10 OTP sends per hour per email
    const { allowed, retryAfter } = await checkRateLimit(`password-reset-send:${email}`, 10, 3600)
    if (!allowed) {
      return set('email', `Too many reset code requests for this email. Please try again in ${retryAfter} seconds.`)
    }

    const supabase = createAdminClient()
    const user = await findAuthUserByEmail(email)
    if (!user) {
      return set('email', `I couldn't find an account with that email. Please double-check or try a different email.`)
    }

    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Invalidate any previous unused OTPs for this email
    await supabase.from('otps').update({ used: true }).eq('email', email).eq('type', 'password_reset').eq('used', false)

    const { error: dbError } = await supabase.from('otps').insert({ email, otp, type: 'password_reset', expires_at: expiresAt })
    if (dbError) {
      return set('email', `Sorry, I couldn't generate a reset code just now. Please try again in a moment.`)
    }

    try {
      await sendOtpEmail(email, otp, 'password_reset')
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr)
      return set('email', `Failed to send the reset code to your email. Please try again.`)
    }

    draft.email = email
    return set('otp', `I've sent a *6-digit reset code* to ${email}. It expires in 10 minutes.\n\nPlease enter the code here.`)
  }

  if (step === 'otp') {
    const code = msg.trim()
    if (!/^\d{6}$/.test(code)) {
      return set('otp', `Please enter the full *6-digit code* you received by email.`)
    }

    const { allowed, retryAfter } = await checkRateLimit(`password-reset-verify:${draft.email as string}`, 10, 3600)
    if (!allowed) {
      return set('otp', `Too many attempts. Please try again in ${retryAfter} seconds.`)
    }

    const supabase = createAdminClient()
    const otpRow = await findValidOtp(supabase, draft.email as string, code, ['password_reset'])
    if (!otpRow) {
      await recordOtpFailure(supabase, draft.email as string, ['password_reset'])
      return set('otp', `Invalid or expired code. Please check your email and try again, or ask for a new code.`)
    }

    await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)
    draft.otpVerified = true
    return set('password', `✅ Code verified.\n\nNow, *what's your new password?* (at least 8 characters)`)
  }

  if (step === 'password') {
    const password = msg.trim()
    if (password.length < 8) {
      return set('password', `Your password needs to be at least *8 characters*. Please try again.`)
    }

    const supabase = createAdminClient()
    const user = await findAuthUserByEmail(draft.email as string)
    if (!user) {
      return set('password', `Account not found. Please start over.`)
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password })
    if (updateError) {
      return set('password', `Sorry, I couldn't update your password: ${updateError.message}`)
    }

    return {
      reply: `✅ *Password updated successfully!*\n\nYou can now sign in with your new password.`,
      state: { mode: 'chat', step: null, draft: {} },
      actions: [{ type: 'link', label: '🔑 Sign in', href: 'https://www.asehanta.com/auth/signin' }],
      quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
    }
  }

  return startPasswordReset()
}

// --------------------------------------------------------------- change email

export function startChangeEmail(): FlowStepResult {
  const state: ChatState = { mode: 'change_email', step: 'current_email', draft: {} }
  return {
    reply: `📧 *Change Email Address*\n\nI can help you change the email on your AseHanta account.\n\nFirst, *what is your current account email?*`,
    state,
    quickReplies: ['Cancel'],
  }
}

export async function continueChangeEmail(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'current_email'
  const set = (next: string, reply: string, quickReplies?: string[], actions?: { type: 'link'; label: string; href: string }[]): FlowStepResult =>
    ({ reply, quickReplies, actions, state: { mode: 'change_email', step: next, draft } })

  if (step === 'current_email') {
    const email = msg.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return set('current_email', `That email doesn't look right — please try again (e.g. you@example.com).`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`change-email-send:${email}`, 10, 3600)
    if (!allowed) {
      return set('current_email', `Too many requests. Please try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const user = await findAuthUserByEmail(email)
    if (!user) {
      return set('current_email', `I couldn't find an account with that email. Please double-check.`)
    }
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await supabase.from('otps').update({ used: true }).eq('email', email).eq('type', 'email_change').eq('used', false)
    const { error: dbError } = await supabase.from('otps').insert({ email, otp, type: 'email_change', expires_at: expiresAt })
    if (dbError) {
      return set('current_email', `Sorry, I couldn't generate a code just now. Try again in a moment.`)
    }
    try {
      await sendOtpEmail(email, otp, 'email_change')
    } catch {
      return set('current_email', `Failed to send the code to your email. Please try again.`)
    }
    draft.current_email = email
    return set('otp_current', `I've sent a *6-digit code* to ${email}. It expires in 10 minutes.\n\nEnter the code here to confirm it's you.`)
  }

  if (step === 'otp_current') {
    const code = msg.trim()
    if (!/^\d{6}$/.test(code)) {
      return set('otp_current', `Please enter the full *6-digit code* from your email.`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`change-email-verify:${draft.current_email}`, 10, 3600)
    if (!allowed) {
      return set('otp_current', `Too many attempts. Try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const otpRow = await findValidOtp(supabase, draft.current_email as string, code, ['email_change'])
    if (!otpRow) {
      await recordOtpFailure(supabase, draft.current_email as string, ['email_change'])
      return set('otp_current', `Invalid or expired code. Check your email and try again.`)
    }
    await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)
    draft.otp_current_verified = true
    return set('new_email', `✅ Current email verified.\n\n*What is your new email address?*`)
  }

  if (step === 'new_email') {
    const newEmail = msg.trim().toLowerCase()
    if (!EMAIL_RE.test(newEmail)) {
      return set('new_email', `That email doesn't look right — please try again (e.g. you@example.com).`)
    }
    if (newEmail === draft.current_email) {
      return set('new_email', `That's the same as your current email. Please enter a different one.`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`change-email-send:${newEmail}`, 10, 3600)
    if (!allowed) {
      return set('new_email', `Too many requests for that email. Try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await supabase.from('otps').update({ used: true }).eq('email', newEmail).eq('type', 'email_change').eq('used', false)
    const { error: dbError } = await supabase.from('otps').insert({ email: newEmail, otp, type: 'email_change', expires_at: expiresAt })
    if (dbError) {
      return set('new_email', `Sorry, I couldn't generate a code just now. Try again in a moment.`)
    }
    try {
      await sendOtpEmail(newEmail, otp, 'email_change')
    } catch {
      return set('new_email', `Failed to send the code to ${newEmail}. Please try again.`)
    }
    draft.new_email = newEmail
    return set('otp_new', `I've sent a *6-digit code* to ${newEmail}. It expires in 10 minutes.\n\nEnter the code here to confirm your new email.`)
  }

  if (step === 'otp_new') {
    const code = msg.trim()
    if (!/^\d{6}$/.test(code)) {
      return set('otp_new', `Please enter the full *6-digit code* from your email.`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`change-email-verify:${draft.new_email}`, 10, 3600)
    if (!allowed) {
      return set('otp_new', `Too many attempts. Try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const otpRow = await findValidOtp(supabase, draft.new_email as string, code, ['email_change'])
    if (!otpRow) {
      await recordOtpFailure(supabase, draft.new_email as string, ['email_change'])
      return set('otp_new', `Invalid or expired code. Check your email and try again.`)
    }
    await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)

    const user = await findAuthUserByEmail(draft.current_email as string)
    if (!user) {
      return set('otp_new', `Account not found. Please start over.`)
    }

    await supabase.auth.admin.updateUserById(user.id, { email: draft.new_email as string })
    await supabase.from('profiles').update({ email: draft.new_email as string }).eq('id', user.id)

    return {
      reply: `✅ *Email changed successfully!*\n\nYour AseHanta account email is now ${draft.new_email as string}.\n\nYou can sign in with the new email.`,
      state: { mode: 'chat', step: null, draft: {} },
      actions: [{ type: 'link', label: '🔑 Sign in', href: 'https://www.asehanta.com/auth/signin' }],
      quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
    }
  }

  return startChangeEmail()
}

// --------------------------------------------------------------- delete account

export function startDeleteAccount(): FlowStepResult {
  const state: ChatState = { mode: 'delete_account', step: 'email', draft: {} }
  return {
    reply: `🗑 *Delete Account*\n\nI can help you permanently delete your AseHanta account.\n\n⚠️ *This cannot be undone.* Your profile, listings, bookings and payment history will be removed.\n\nFirst, *what is your account email?*`,
    state,
    quickReplies: ['Cancel'],
  }
}

export async function continueDeleteAccount(state: ChatState, msg: string): Promise<FlowStepResult> {
  const draft = { ...(state.draft ?? {}) }
  const step = state.step ?? 'email'
  const set = (next: string, reply: string, quickReplies?: string[], actions?: { type: 'link'; label: string; href: string }[]): FlowStepResult =>
    ({ reply, quickReplies, actions, state: { mode: 'delete_account', step: next, draft } })

  if (step === 'email') {
    const email = msg.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      return set('email', `That email doesn't look right — please try again (e.g. you@example.com).`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`delete-account-send:${email}`, 10, 3600)
    if (!allowed) {
      return set('email', `Too many requests. Please try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const user = await findAuthUserByEmail(email)
    if (!user) {
      return set('email', `I couldn't find an account with that email. Please double-check.`)
    }
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await supabase.from('otps').update({ used: true }).eq('email', email).eq('type', 'delete_account').eq('used', false)
    const { error: dbError } = await supabase.from('otps').insert({ email, otp, type: 'delete_account', expires_at: expiresAt })
    if (dbError) {
      return set('email', `Sorry, I couldn't generate a code just now. Try again in a moment.`)
    }
    try {
      await sendOtpEmail(email, otp, 'delete_account')
    } catch {
      return set('email', `Failed to send the code to your email. Please try again.`)
    }
    draft.email = email
    draft.user_id = user.id
    return set('otp', `I've sent a *6-digit code* to ${email}. It expires in 10 minutes.\n\nEnter the code here to confirm it's you.`)
  }

  if (step === 'otp') {
    const code = msg.trim()
    if (!/^\d{6}$/.test(code)) {
      return set('otp', `Please enter the full *6-digit code* from your email.`)
    }
    const { allowed, retryAfter } = await checkRateLimit(`delete-account-verify:${draft.email}`, 10, 3600)
    if (!allowed) {
      return set('otp', `Too many attempts. Try again in ${retryAfter} seconds.`)
    }
    const supabase = createAdminClient()
    const otpRow = await findValidOtp(supabase, draft.email as string, code, ['delete_account'])
    if (!otpRow) {
      await recordOtpFailure(supabase, draft.email as string, ['delete_account'])
      return set('otp', `Invalid or expired code. Check your email and try again.`)
    }
    await supabase.from('otps').update({ used: true }).eq('id', otpRow.id)
    draft.otp_verified = true
    return set('confirm', `⚠️ *Final confirmation — this permanently deletes your account.*\n\nYour profile, listings, bookings and payment history will be removed and cannot be recovered.\n\nType *DELETE MY ACCOUNT* to confirm, or anything else to cancel.`)
  }

  if (step === 'confirm') {
    if (!/^DELETE MY ACCOUNT$/i.test(msg.trim())) {
      return set('confirm', `Account deletion cancelled. Nothing was changed.\n\nType *DELETE MY ACCOUNT* to confirm, or anything else to cancel.`)
    }
    const supabase = createAdminClient()
    await supabase.from('profiles').delete().eq('id', draft.user_id as string)
    const { error: authError } = await supabase.auth.admin.deleteUser(draft.user_id as string)
    if (authError) {
      return {
        reply: `Your profile was deleted, but the auth account couldn't be removed: ${authError.message}. Please contact support.`,
        state: { mode: 'chat', step: null, draft: {} },
        actions: [{ type: 'link', label: '📞 Contact support', href: 'https://www.asehanta.com/contact' }],
        quickReplies: ['🏠 Find me a house', '📞 Contact'],
      }
    }
    return {
      reply: `✅ *Account deleted permanently.*\n\nYour AseHanta account and all associated data have been removed.\n\nWe're sorry to see you go.`,
      state: { mode: 'chat', step: null, draft: {} },
      actions: [{ type: 'link', label: '🏠 Find a house', href: 'https://www.asehanta.com' }],
      quickReplies: ['🏠 Find me a house', '📞 Contact'],
    }
  }

  return startDeleteAccount()
}

// --------------------------------------------------------------- change DP

export function startChangeDP(): FlowStepResult {
  return {
    reply: `📸 *Change Profile Picture*\n\nUpload a new photo on your profile page.\n\nOpen your profile, tap your avatar, and upload a JPG/PNG/WebP/AVIF image (max 4MB).\n\nWhen you upload a new photo, your old one is automatically deleted to save space.\n\nWant to *remove* your current profile picture instead? Reply *remove dp*.`,
    state: { mode: 'chat', step: null, draft: {} },
    actions: [{ type: 'link', label: '👤 Go to profile', href: 'https://www.asehanta.com/profile' }],
    quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
  }
}

export async function continueDeleteDP(state: ChatState, msg: string): Promise<FlowStepResult> {
  const low = msg.trim().toLowerCase()
  if (/^(remove dp|delete dp|remove avatar|delete avatar|yes|remove it|delete it)$/i.test(low)) {
    // The actual deletion happens client-side via /api/delete-avatar; here we
    // just confirm and point them to the button.
    return {
      reply: `🗑 Go to your profile and tap *Remove avatar* under your profile picture. The old image will be deleted from storage.\n\nIs there anything else I can help with?`,
      state: { mode: 'chat', step: null, draft: {} },
      actions: [{ type: 'link', label: '👤 Go to profile', href: 'https://www.asehanta.com/profile' }],
      quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
    }
  }
  return {
    reply: `Reply *remove dp* to confirm deletion, or anything else to keep your current picture.`,
    state,
    quickReplies: ['remove dp', 'keep it'],
  }
}
