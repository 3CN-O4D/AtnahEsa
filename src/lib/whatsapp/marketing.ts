import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabled, aiEndpoint, aiKey, aiModel } from '@/lib/chat/ai'

/**
 * Marketing draft generation shared by the Baileys bridge and the admin panel.
 *
 * Wording comes from the same NVIDIA-powered model as the chat, using real
 * listing rows only. The model is forbidden from inventing a price, area or
 * amenity. A deterministic template is the fallback, so a missing AI key never
 * stops marketing entirely.
 */

export const MARKETING_BASE = 'https://www.asehanta.com'
export const HUNTER_SIGNUP = `${MARKETING_BASE}/auth/signup?role=hunter`
export const LISTER_SIGNUP = `${MARKETING_BASE}/auth/signup?role=lister`

export interface MarketingListing {
  id: string
  title: string | null
  description: string | null
  rent: number | null
  price: number | null
  location: string | null
  descriptive_location: string | null
  house_type: string | null
  water: string | null
  electricity: string | null
  deposit: number | null
  deposit_refundable: boolean | null
  vacancy: string | null
  images: string[] | null
  created_at: string | null
}

export interface MarketingDraftInput {
  channel: 'status' | 'group'
  target_jid?: string | null
  topic?: string
  auto?: boolean
  created_by?: string
}

type Facts = {
  title: string
  location: string
  rent: string | null
  deposit: string | null
  house_type: string | null
  water: string | null
  electricity: string | null
  vacancy: string | null
  description: string
  link: string
  image: string | null
}

const money = (value: number | null) => (value ? `KSh ${value.toLocaleString('en-KE')}` : null)

export function listingFacts(listing: MarketingListing): Facts {
  const location = listing.descriptive_location || listing.location || 'Eldoret'
  const deposit = listing.deposit
    ? `${money(listing.deposit)}${listing.deposit_refundable ? ' refundable' : ''}`
    : null
  const description = (listing.description ?? '').trim()

  return {
    title: listing.title || 'Available house',
    location,
    rent: money(listing.rent),
    deposit,
    house_type: listing.house_type || null,
    water: listing.water || null,
    electricity: listing.electricity || null,
    vacancy: listing.vacancy || null,
    description: description.length > 420 ? `${description.slice(0, 420).trimEnd()}…` : description,
    link: `${MARKETING_BASE}/listings/${listing.id}`,
    image: (listing.images ?? []).find(Boolean) ?? null,
  }
}

export function templateBody(channel: 'status' | 'group', facts: Facts) {
  const details = [
    facts.house_type,
    facts.water ? `${facts.water} water` : null,
    facts.electricity ? `${facts.electricity} power` : null,
    facts.vacancy === 'vacant' ? 'Vacant now' : null,
  ].filter(Boolean)

  if (channel === 'status') {
    return [
      `🏠 *${facts.title}*`,
      `📍 ${facts.location}`,
      facts.rent ? `💰 *${facts.rent}/month*` : '',
      facts.deposit ? `🛡️ Deposit: ${facts.deposit}` : '',
      details.length ? details.join(' • ') : '',
      '',
      'Verified. View photos and book a viewing:',
      facts.link,
      '',
      `Looking for a house? Join free: ${HUNTER_SIGNUP}`,
    ]
      .filter((line) => line !== '')
      .join('\n')
  }

  return [
    `🏠 *${facts.title}*`,
    '',
    `📍 ${facts.location}`,
    facts.rent ? `💰 *${facts.rent}/month*` : '',
    facts.deposit ? `🛡️ Deposit: ${facts.deposit}` : '',
    details.length ? details.join(' • ') : '',
    facts.description ? `\n${facts.description}` : '',
    '',
    '✅ Verified listing on AseHanta',
    `👉 Full photos and viewing: ${facts.link}`,
    '',
    `🔎 Hunting for a house? Sign up free: ${HUNTER_SIGNUP}`,
    `💼 Have a house to list? Earn with us: ${LISTER_SIGNUP}`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

const SYSTEM_PROMPT = `You write short WhatsApp marketing copy for AseHanta, a Kenyan house-hunting platform in Eldoret.

You are given real listing facts. Never invent or change a price, deposit, area, amenity or availability. If a fact is missing, leave it out.

Sound like a friendly Kenyan letting agent texting, not a corporate advertiser:
- Short lines, WhatsApp formatting (*bold*), 2-4 relevant emoji.
- For a status: at most 600 characters, one clear call to action and the listing link.
- For a group post: at most 900 characters, warm and non-spammy, invite people to view or sign up.
- Include the hunter signup link when it fits; include the lister link only for group posts.
- No hashtags, no "Dear customers", no fake urgency, no ALL CAPS.

Return ONLY compact JSON:
{"body":"...","headline":"max 6 words","subline":"area + rent, max 8 words"}`

async function askModel(channel: 'status' | 'group', topic: string, facts: Facts) {
  if (!aiEnabled()) return null

  const user = JSON.stringify({
    channel,
    topic: topic === 'auto' ? 'choose a useful angle (new listing, vacant now, affordable, moving soon)' : topic,
    listing: {
      title: facts.title,
      location: facts.location,
      rent: facts.rent,
      deposit: facts.deposit,
      house_type: facts.house_type,
      water: facts.water,
      electricity: facts.electricity,
      vacancy: facts.vacancy,
      description: facts.description,
      link: facts.link,
    },
    links: {
      listing: facts.link,
      hunter_signup: HUNTER_SIGNUP,
      lister_signup: LISTER_SIGNUP,
    },
  })

  try {
    const res = await fetch(aiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiKey()}` },
      body: JSON.stringify({
        model: aiModel(),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      console.error(`[marketing] AI returned ${res.status}`)
      return null
    }

    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ''
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed = JSON.parse(match[0])
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
    if (!body) return null

    return {
      body,
      headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : null,
      subline: typeof parsed.subline === 'string' ? parsed.subline.trim() : null,
    }
  } catch (error) {
    console.error('[marketing] AI draft failed:', error instanceof Error ? error.message : error)
    return null
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * Pick a listing that has not been marketed recently.
 *
 * The bot tracks its own activity: a listing may be posted at most once per
 * 24 hours and at most twice per week. If every published house has already
 * been covered today, return null so the caller writes a brand post instead
 * of repeating one house five times (which is exactly what used to happen).
 */
async function pickListing(admin: ReturnType<typeof createAdminClient>, topic: string) {
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString()

  const { data: recent } = await admin
    .from('whatsapp_marketing')
    .select('listing_id, channel, status, sent_at, created_at')
    .not('listing_id', 'is', null)
    .gte('created_at', weekAgo)
    .limit(500)

  const now = Date.now()
  const postedToday = new Set<string>()
  const weeklyCount = new Map<string, number>()

  for (const row of recent ?? []) {
    const id = row.listing_id as string | null
    if (!id || row.status !== 'sent') continue
    weeklyCount.set(id, (weeklyCount.get(id) ?? 0) + 1)
    const sentAt = row.sent_at ? new Date(row.sent_at).getTime() : null
    if (sentAt && now - sentAt < DAY_MS) postedToday.add(id)
  }

  const { data, error } = await admin
    .from('listings')
    .select(
      'id,title,description,rent,price,location,descriptive_location,house_type,water,electricity,deposit,deposit_refundable,vacancy,images,created_at'
    )
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(60)

  if (error) {
    console.error('[marketing] listing query failed:', error.message)
    return null
  }

  const listings = (data ?? []) as MarketingListing[]
  if (!listings.length) return null

  // Prefer houses untouched this week, then those posted once. Never today.
  const eligible = listings.filter((listing) => !postedToday.has(listing.id))
  const fresh = eligible.filter((listing) => (weeklyCount.get(listing.id) ?? 0) === 0)
  const once = eligible.filter((listing) => (weeklyCount.get(listing.id) ?? 0) < 2)
  const pool = fresh.length ? fresh : once

  if (!pool.length) {
    console.warn('[marketing] every published house was already posted today; using a brand post')
    return null
  }

  const topicText = topic && topic !== 'auto' ? topic.toLowerCase() : ''
  if (topicText) {
    const match = pool.find((listing) =>
      `${listing.title ?? ''} ${listing.descriptive_location ?? ''} ${listing.location ?? ''} ${
        listing.house_type ?? ''
      }`
        .toLowerCase()
        .includes(topicText)
    )
    if (match) return match
  }

  // Rotate hourly so a burst of calls does not all pick row one.
  return pool[Math.floor(Date.now() / (60 * 60 * 1000)) % pool.length]
}

export async function generateMarketingDraft(input: MarketingDraftInput) {
  const channel = input.channel
  const targetJid = input.target_jid ? String(input.target_jid).slice(0, 120) : null
  const topic = input.topic?.trim() ? input.topic.trim().slice(0, 120) : 'auto'
  const auto = input.auto !== false

  const admin = createAdminClient()

  const listing = await pickListing(admin, topic)
  const facts = listing ? listingFacts(listing) : null
  const aiDraft = facts ? await askModel(channel, topic, facts) : null

  const fallback = templateBody(
    channel,
    facts ?? {
      title: 'Find your next home in Eldoret',
      location: 'Verified houses · Movers · WiFi',
      rent: null,
      deposit: null,
      house_type: null,
      water: null,
      electricity: null,
      vacancy: null,
      description: '',
      link: MARKETING_BASE,
      image: null,
    }
  )

  const meta = {
    headline: aiDraft?.headline || facts?.title || null,
    subline: aiDraft?.subline || facts?.location || null,
    source: aiDraft ? 'ai' : 'template',
    topic,
  }

  const { data: control } = await admin
    .from('whatsapp_bot_control')
    .select('mode, require_approval')
    .eq('id', 1)
    .maybeSingle()

  /*
   * Mode is the single source of truth:
   *   autonomous → no waiting, send immediately
   *   regular    → queue for an admin
   *   off        → still let an admin generate, but queue it
   */
  const requireApproval =
    control?.mode === 'autonomous'
      ? false
      : control?.mode === 'regular'
        ? true
        : control?.require_approval !== false

  const { data: draft, error } = await admin
    .from('whatsapp_marketing')
    .insert({
      channel,
      target_jid: targetJid,
      body: (aiDraft?.body || fallback).slice(0, 3000),
      image_url: facts?.image ?? null,
      listing_id: listing?.id ?? null,
      template: aiDraft ? 'ai' : 'template',
      status: requireApproval ? 'draft' : 'approved',
      scheduled_for: new Date().toISOString(),
      created_by: input.created_by ?? (auto ? 'marketing' : 'admin'),
      meta,
    })
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)

  return draft
}
