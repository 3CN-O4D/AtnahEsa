import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyAdmins } from '@/lib/notify'
import { searchHouses } from './houseSearch'
import type { AdminAlert, HouseCardData } from './types'
import { PAGE_LINKS, CONTACT_INFO } from './knowledge'

export interface ToolResult {
  ok: boolean
  text: string
  cards?: HouseCardData[]
  error?: string
  /** Forwarded to the WhatsApp bridge so admins get a direct message too. */
  adminAlert?: AdminAlert
}

/** Live house counts across the platform, broken down by listing status. */
export async function toolStats(): Promise<ToolResult> {
  const supabase = createAdminClient()
  const [
    listings,
    published,
    booked,
    taken,
    pending,
    rejected,
    hunters,
    listers,
  ] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact', head: true }),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'booked'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'taken'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'hunter'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'lister'),
  ])
  const total = listings.count ?? 0
  const available = published.count ?? 0
  return {
    ok: true,
    text: `Here's the latest 👇\n\n🏠 *${total}* houses listed\n✅ *${available}* available\n⏳ *${booked.count ?? 0}* being viewed\n❌ *${taken.count ?? 0}* taken\n⏱ *${pending.count ?? 0}* awaiting approval\n🚫 *${rejected.count ?? 0}* rejected\n👥 *${hunters.count ?? 0}* hunters\n🏡 *${listers.count ?? 0}* listers\n\nWant me to find you one?`,
  }
}

export async function toolSearchHouses(query: string): Promise<ToolResult> {
  if (!query || query.trim().length < 2) {
    return { ok: false, text: 'Please describe the house you are looking for (area, bedrooms, budget).', error: 'missing query' }
  }
  const { cards, total, takenNote } = await searchHouses(query, 5)
  if (cards.length === 0) {
    return {
      ok: true,
      text: `No available houses matched "${query.trim()}". Try a different area, budget or house type.`,
    }
  }
  const lines = cards.map((c) => {
    const rent = c.rent ? `KSh ${c.rent.toLocaleString()}/mo` : 'rent n/a'
    const loc = c.descriptive_location || c.location
    return `- ${c.title} (${loc}) — ${rent}`
  })
  return {
    ok: true,
    text: `I found ${cards.length} matching house${cards.length === 1 ? '' : 's'}:\n${lines.join('\n')}\n${takenNote ? `\n${takenNote}` : ''}\n\nTap a card below to view the full listing.`,
    cards,
  }
}

/** Columns safe to show outside the owner-only listing editor. */
const PUBLIC_LISTING_COLUMNS =
  'id,title,description,price,rent,location,descriptive_location,images,house_type,building_type,floor_number,water,electricity,electric_bill,deposit,deposit_refundable,vacancy,vacancy_type,why_vacant,status,issues,issues_count,youtube_url,tiktok_url,video_url,video_urls,created_at'

interface LookupListing {
  id: string
  title: string | null
  description: string | null
  price: number | null
  rent: number | null
  location: string | null
  descriptive_location: string | null
  images: string[] | null
  house_type: string | null
  building_type: string | null
  floor_number: string | null
  water: string | null
  electricity: string | null
  electric_bill: string | null
  deposit: number | null
  deposit_refundable: boolean | null
  vacancy: string | null
  vacancy_type: string | null
  why_vacant: string | null
  status: string | null
  issues: string[] | null
  issues_count: number | null
  youtube_url: string | null
  tiktok_url: string | null
  video_url: string | null
  video_urls: string[] | null
  created_at: string | null
}

/**
 * Fetch one listing by id (or by a pasted listing link) and return everything a
 * house hunter would see on the listing page, plus its photos as cards. This is
 * what lets the assistant answer "what about listing <id>?" and send the images
 * on WhatsApp instead of only the cover photo.
 */
export async function toolGetHouse(input: string): Promise<ToolResult> {
  const raw = String(input ?? '').trim()
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  const id = match ? match[0] : raw

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return {
      ok: false,
      text: 'Send me the house link or the listing id and I will pull up the full details and photos.',
      error: 'missing listing id',
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('listings')
    .select(PUBLIC_LISTING_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, text: 'Could not load that house right now.', error: error.message }
  if (!data) return { ok: true, text: 'I could not find that house — it may have been removed. Want me to search for something similar?' }

  const l = data as unknown as LookupListing
  const rent = l.rent ?? l.price ?? 0
  const photos = (l.images ?? []).filter(Boolean)
  const statusLine =
    l.status === 'taken'
      ? '🚫 This one is already taken.'
      : l.status === 'booked'
        ? '⏳ Someone is currently viewing this one.'
        : l.status === 'published'
          ? '✅ Available for viewing.'
          : `Status: ${l.status ?? 'unknown'}.`
  const facts = [
    l.house_type ? `🏠 ${l.house_type}` : '',
    l.building_type ? `🏢 ${l.building_type}${l.floor_number ? ` · floor ${l.floor_number}` : ''}` : '',
    l.water ? `💧 Water: ${l.water}` : '',
    l.electricity ? `💡 Electricity: ${l.electricity}${l.electric_bill ? ` (${l.electric_bill})` : ''}` : '',
    l.vacancy ? `📅 ${l.vacancy}` : '',
    l.issues_count !== null && l.issues_count !== undefined ? `🔧 ${l.issues_count} known issue${l.issues_count === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  const money = [
    rent ? `💰 *KSh ${rent.toLocaleString()}/month*` : '',
    l.price ? `🔑 Viewing fee: KSh ${l.price.toLocaleString()}` : '',
    l.deposit ? `🛡️ Deposit: KSh ${l.deposit.toLocaleString()}${l.deposit_refundable ? ' (refundable)' : ''}` : '',
  ].filter(Boolean)
  const description = (l.description ?? '').trim()
  const shortDescription = description.length > 600 ? `${description.slice(0, 600).trimEnd()}…` : description
  const link = `https://www.asehanta.com/listings/${l.id}`

  const text = [
    `*${l.title ?? 'House'}*`,
    `📍 ${l.descriptive_location || l.location || 'Location not given'}`,
    money.join('\n'),
    facts.join(' · '),
    statusLine,
    shortDescription,
    link,
  ]
    .filter(Boolean)
    .join('\n\n')

  const card: HouseCardData = {
    id: l.id,
    title: l.title ?? 'House',
    location: l.location ?? 'Unknown area',
    descriptive_location: l.descriptive_location,
    rent,
    price: l.price ?? rent,
    house_type: l.house_type,
    water: l.water,
    deposit: l.deposit,
    deposit_refundable: l.deposit_refundable,
    vacancy: l.vacancy,
    status: l.status,
    image: photos[0] ?? null,
    images: photos,
    badges: [
      l.house_type ?? '',
      l.deposit_refundable ? 'Refundable deposit' : '',
      l.status === 'published' ? 'Available now' : l.status === 'booked' ? 'Being viewed' : l.status === 'taken' ? 'Taken' : '',
    ].filter(Boolean),
  }

  return {
    ok: true,
    text,
    cards: [card],
  }
}

export async function toolWifiPackages(): Promise<ToolResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('wifi_packages').select('*').order('price', { ascending: true }).limit(12)
  if (error || !data) return { ok: false, text: 'Could not load WiFi packages right now.', error: error?.message }
  const lines = data.map((p) => `- ${p.name} — ${p.speed} — KSh ${p.price.toLocaleString()}/mo`)
  return {
    ok: true,
    text: `*WiFi packages*\n${lines.join('\n')}\n\nBrowse all packages and book here: ${PAGE_LINKS.wifi.href}`,
  }
}
export async function toolMovers(): Promise<ToolResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('movers').select('*').order('created_at', { ascending: false }).limit(10)
  if (error || !data) return { ok: false, text: 'Could not load movers right now.', error: error?.message }
  const lines = data.map((m) => `- ${m.name} — ${m.location || 'Kenya'} — from KSh ${m.price.toLocaleString()}`)
  return {
    ok: true,
    text: `*Verified movers*\n${lines.join('\n')}\n\nBrowse movers here: ${PAGE_LINKS.movers.href}`,
  }
}

export function toolContact(): ToolResult {
  return {
    ok: true,
    text: `*Contact AseHanta*\n\n📧 Email: ${CONTACT_INFO.email}\n📞 Phone: ${CONTACT_INFO.phone}\n💬 WhatsApp: ${CONTACT_INFO.whatsapp}\n📍 Location: ${CONTACT_INFO.location}\n\n${CONTACT_INFO.hours}`,
  }
}

export function toolLinks(page?: string): ToolResult {
  const key = (page ?? '').toLowerCase().trim()
  const all = Object.entries(PAGE_LINKS)
    .map(([k, v]) => `- ${v.label}`)
    .join('\n')
  const specific = PAGE_LINKS[key]
  return {
    ok: true,
    text: specific
      ? `Here you go: ${specific.label}\n${specific.href}`
      : `*Popular pages*\n${all}\n\nJust tell me which one you need and I'll link it.`,
  }
}

const CHAT_CATEGORIES = ['complaint', 'bug', 'payment', 'listing', 'account', 'feature', 'other'] as const
const CHAT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

/**
 * Email the AseHanta admin team about anything important that needs a human —
 * complaints, bug reports, urgent issues, payment/listing problems, feature
 * requests, partnership/business inquiries, or escalation. Also files it in
 * the admin complaints panel and raises an in-app admin notification.
 */
export async function toolNotifyAdmin(args: Record<string, unknown>): Promise<ToolResult> {
  const rawCategory = String(args.category ?? '').trim().toLowerCase()
  const category = (CHAT_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'other'
  const rawPriority = String(args.priority ?? '').trim().toLowerCase()
  const priority = (CHAT_PRIORITIES as readonly string[]).includes(rawPriority) ? rawPriority : 'normal'
  // Free-text label for the email, e.g. "partnership inquiry" or "urgent issue".
  const topic = String(args.topic ?? '').trim().slice(0, 100) || category
  const subject = String(args.subject ?? '').trim().slice(0, 140)
  const message = String(args.message ?? '').trim().slice(0, 4000)
  const name = String(args.name ?? '').trim().slice(0, 100)
  const email = String(args.email ?? '').trim().toLowerCase().slice(0, 200)
  const phone = String(args.phone ?? '').trim().slice(0, 30)
  const relatedListingId = String(args.related_listing_id ?? '').trim()

  if (subject.length < 3) {
    return { ok: false, text: 'Please include a short subject — a few words is enough.', error: 'missing subject' }
  }
  if (message.length < 10) {
    return { ok: false, text: 'Please describe the matter in a sentence or two so the team can act.', error: 'message too short' }
  }

  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('complaints')
    .insert({
      user_id: null,
      name: name || 'Ase chat user',
      email,
      phone,
      category,
      priority,
      subject,
      message,
      related_listing_id: relatedListingId || null,
    })
    .select('id, subject, category, priority')
    .single()

  if (error) {
    console.error('Chat report insert failed:', error)
    return { ok: false, text: `Sorry, I couldn't send that just now. Please try again in a moment.`, error: error.message }
  }

  await createNotification({
    role: 'admin',
    category: 'system',
    title: `${priority === 'urgent' ? '🚨 ' : ''}New ${topic} via chat: ${subject}`,
    body: `${name || 'Ase chat user'} · ${email || phone || 'no contact'} · priority: ${priority}`,
    link: '/admin/complaints',
    data: { complaint_id: row.id, category: row.category, priority: row.priority },
  })

  await notifyAdmins(`New ${topic} via Chatbot`, subject, {
    Topic: topic,
    Category: category,
    Priority: priority.toUpperCase(),
    Name: name || 'Not provided',
    Email: email || 'Not provided',
    Phone: phone || 'Not provided',
    Message: message,
    'Related Listing': relatedListingId || 'None',
    Source: 'Ase chatbot',
  })

  return {
    ok: true,
    text: `Sent — the AseHanta team has been notified about "${subject}" (ref ${row.id.slice(0, 8)}). They usually respond within 24 hours.`,
    adminAlert: {
      topic,
      subject,
      priority: priority as AdminAlert['priority'],
      message,
      name: name || undefined,
      phone: phone || undefined,
      email: email || undefined,
      listingId: relatedListingId || undefined,
    },
  }
}

/** Unified tool map used by the AI tool-calling loop. */
export const TOOLS = {
  search_houses: { desc: 'Search available houses by area, bedrooms, budget, water/token preferences.', run: (a: Record<string, unknown>) => toolSearchHouses(typeof a?.query === 'string' ? a.query : ''), params: { query: 'string' } },
  get_house: {
    desc: 'Look up one specific house by its listing id or a pasted listing link, then return the full details and photos. Use this whenever the user shares a listing link/id or asks about the house they were just shown. Never invent details for a specific listing.',
    run: (a: Record<string, unknown>) => toolGetHouse(typeof a?.id === 'string' ? a.id : String(a?.url ?? '')),
    params: { id: 'string' },
  },
  get_stats: { desc: 'Get current house and user statistics.', run: toolStats, params: {} },
  wifi_packages: { desc: 'List current WiFi packages and prices.', run: toolWifiPackages, params: {} },
  movers: { desc: 'List verified movers.', run: toolMovers, params: {} },
  contact_info: { desc: 'Get AseHanta contact details.', run: toolContact, params: {} },
  page_links: { desc: 'Get shortcut links to site pages.', run: (a: Record<string, unknown>) => toolLinks(typeof a?.page === 'string' ? a.page : undefined), params: { page: 'string' } },
  notify_admin: {
    desc: 'Email the AseHanta admin team about anything important that needs a real human: complaints, bug reports, urgent problems, payment/listing issues, feature requests, partnership/business inquiries, or escalation. Collect the user\'s name, contact (email or phone) and a short message first, then call this with topic, subject, message, priority and category.',
    run: (a: Record<string, unknown>) => toolNotifyAdmin(a),
    params: { topic: 'string', category: 'string', priority: 'string', subject: 'string', name: 'string', email: 'string', phone: 'string', message: 'string', related_listing_id: 'string' },
  },
} as const

export type ToolName = keyof typeof TOOLS

export async function runTool(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = TOOLS[name]
  try {
    return await tool.run(typeof args === 'object' && args ? args : {})
  } catch (err) {
    return { ok: false, text: `Tool ${name} failed.`, error: err instanceof Error ? err.message : String(err) }
  }
}

/** JSON-schema tool definitions for OpenAI-compatible APIs. */
export function toolSchemas() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    type: 'function',
    function: {
      name,
      description: t.desc,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.keys(t.params).map((k) => [k, { type: t.params[k as keyof typeof t.params] === 'number' ? 'number' : 'string' }])),
        additionalProperties: false,
      },
    },
  }))
}
