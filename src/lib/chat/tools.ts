import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { notifyAdmins } from '@/lib/notify'
import { searchHouses } from './houseSearch'
import type { HouseCardData } from './types'
import { PAGE_LINKS, CONTACT_INFO } from './knowledge'

export interface ToolResult {
  ok: boolean
  text: string
  cards?: HouseCardData[]
  error?: string
}

/** Live house counts across the platform. */
export async function toolStats(): Promise<ToolResult> {
  const supabase = createAdminClient()
  const [listings, hunters, listers] = await Promise.all([
    supabase.from('listings').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'hunter'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'lister'),
  ])
  const total = listings.count ?? 0
  return {
    ok: true,
    text: `Here's the latest 👇\n\n🏠 *${total}* houses listed\n👥 *${hunters.count ?? 0}* hunters\n🏡 *${listers.count ?? 0}* listers\n\nWant me to find you one?`,
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
  }
}

/** Unified tool map used by the AI tool-calling loop. */
export const TOOLS = {
  search_houses: { desc: 'Search available houses by area, bedrooms, budget, water/token preferences.', run: (a: Record<string, unknown>) => toolSearchHouses(typeof a?.query === 'string' ? a.query : ''), params: { query: 'string' } },
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
