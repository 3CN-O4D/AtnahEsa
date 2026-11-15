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
  released_at?: string | null
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
  justReleased: boolean
}

const money = (value: number | null) => (value ? `KSh ${value.toLocaleString('en-KE')}` : null)

export function listingFacts(listing: MarketingListing, justReleased = false): Facts {
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
    justReleased,
  }
}

export function templateBody(channel: 'status' | 'group', facts: Facts) {
  const details = [
    facts.house_type,
    facts.water ? `${facts.water} water` : null,
    facts.electricity ? `${facts.electricity} power` : null,
    facts.vacancy === 'vacant' ? 'Vacant now' : null,
  ].filter(Boolean)

  const opening = facts.justReleased ? '🔥 *Just released*' : null

  if (channel === 'status') {
    return [
      opening,
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
      .filter((line) => line !== null && line !== '')
      .join('\n')
  }

  return [
    opening,
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
    .filter((line) => line !== null && line !== '')
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

When the listing is marked justReleased, open the body with *Just released* so it reads as a fresh release, then describe the house normally.

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
      just_released: facts.justReleased,
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
const HISTORY_MS = 7 * DAY_MS
const RELEASE_WINDOW_MS = 7 * DAY_MS
const MAX_POSTS_PER_LISTING_PER_DAY = 2

type ListingPick = { listing: MarketingListing; justReleased: boolean }

/**
 * Pick the next available house to market.
 *
 * The bot keeps its own diary in `whatsapp_marketing` and rotates through
 * available published houses instead of repeating one post:
 *
 *   - a house may appear at most twice a day per channel,
 *   - the house posted last is skipped so consecutive posts differ,
 *   - drafts already waiting for approval reserve their house,
 *   - a house that was just released is prioritised and flagged `justReleased`.
 *
 * When no house is eligible the caller skips the slot. A repeated brand post
 * is worse than no post: that is what made one status appear 10+ times.
 */
async function pickListing(
  admin: ReturnType<typeof createAdminClient>,
  topic: string,
  channel: 'status' | 'group',
  { allowRecent = false }: { allowRecent?: boolean } = {}
): Promise<ListingPick | null> {
  const since = new Date(Date.now() - HISTORY_MS).toISOString()

  const { data: recent, error: historyError } = await admin
    .from('whatsapp_marketing')
    .select('listing_id, channel, status, sent_at, created_at')
    .not('listing_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (historyError) {
    console.error('[marketing] marketing history query failed:', historyError.message)
  }

  const now = Date.now()
  const lastSentAt = new Map<string, number>()
  const sentToday = new Map<string, number>()
  const reserved = new Set<string>()
  let lastSentListingId: string | null = null
  let lastSentListingAt = 0
  const lastSentByChannel = new Map<string, string>()
  const lastSentChannelAt = new Map<string, number>()

  for (const row of recent ?? []) {
    const id = row.listing_id as string | null
    if (!id) continue

    if (['draft', 'approved', 'scheduled', 'sending'].includes(String(row.status))) {
      reserved.add(id)
      continue
    }
    if (row.status !== 'sent' || !row.sent_at) continue

    const sentAt = new Date(row.sent_at).getTime()
    if (Number.isNaN(sentAt)) continue

    if (sentAt > (lastSentAt.get(id) ?? 0)) lastSentAt.set(id, sentAt)
    if (sentAt > lastSentListingAt) {
      lastSentListingAt = sentAt
      lastSentListingId = id
    }
    const channelKey = String(row.channel)
    if (sentAt > (lastSentChannelAt.get(channelKey) ?? 0)) {
      lastSentChannelAt.set(channelKey, sentAt)
      lastSentByChannel.set(channelKey, id)
    }
    if (now - sentAt < DAY_MS) {
      const key = `${id}:${row.channel}`
      sentToday.set(key, (sentToday.get(key) ?? 0) + 1)
    }
  }

  const columns =
    'id,title,description,rent,price,location,descriptive_location,house_type,water,electricity,deposit,deposit_refundable,vacancy,images,created_at'

  const load = (onlyVacant: boolean, withRelease: boolean) => {
    let query = admin
      .from('listings')
      .select(withRelease ? `${columns},released_at` : columns)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100)
    if (onlyVacant) query = query.eq('vacancy', 'vacant')
    return query
  }

  let result = await load(true, true)
  if (result.error && /released_at/i.test(result.error.message)) {
    // Deploy can land before `migration-whatsapp-marketing-fix.sql` runs.
    result = await load(true, false)
  }
  if (!result.error && !(result.data ?? []).length) {
    result = await load(false, true)
    if (result.error && /released_at/i.test(result.error.message)) {
      result = await load(false, false)
    }
  }

  if (result.error) {
    console.error('[marketing] listing query failed:', result.error.message)
    return null
  }

  const listings = (result.data ?? []) as unknown as MarketingListing[]
  if (!listings.length) return null

  const releasedAt = (listing: MarketingListing) => {
    if (!listing.released_at) return 0
    const at = new Date(listing.released_at).getTime()
    return Number.isNaN(at) ? 0 : at
  }

  const isFreshRelease = (listing: MarketingListing) => {
    const at = releasedAt(listing)
    if (!at || now - at > RELEASE_WINDOW_MS) return false
    return at > (lastSentAt.get(listing.id) ?? 0)
  }

  const withinDailyCap = (listing: MarketingListing) =>
    (sentToday.get(`${listing.id}:${channel}`) ?? 0) < MAX_POSTS_PER_LISTING_PER_DAY

  let pool = listings.filter((listing) => {
    if (!allowRecent && !withinDailyCap(listing)) return false
    return !reserved.has(listing.id)
  })

  if (!pool.length && !allowRecent) {
    console.warn('[marketing] every available house has reached its daily post cap')
    return null
  }
  if (!pool.length) pool = listings

  const avoidRepeating = new Set(
    [lastSentListingId, lastSentByChannel.get(channel) ?? null].filter((id): id is string => Boolean(id))
  )
  // A fresh release is news, so it may go out even if it was the last house.
  const differentHouse = pool.filter(
    (listing) => !avoidRepeating.has(listing.id) || isFreshRelease(listing)
  )
  if (differentHouse.length) pool = differentHouse

  const byOldestPost = (a: MarketingListing, b: MarketingListing) =>
    (lastSentAt.get(a.id) ?? 0) - (lastSentAt.get(b.id) ?? 0) ||
    (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0)

  const topicText = topic && topic !== 'auto' ? topic.toLowerCase() : ''
  const matchesTopic = (listing: MarketingListing) =>
    `${listing.title ?? ''} ${listing.descriptive_location ?? ''} ${listing.location ?? ''} ${
      listing.house_type ?? ''
    }`
      .toLowerCase()
      .includes(topicText)

  const freshReleases = pool.filter(isFreshRelease).sort((a, b) => releasedAt(b) - releasedAt(a))

  let listing: MarketingListing | null = null
  if (freshReleases.length) {
    listing = topicText ? (freshReleases.find(matchesTopic) ?? freshReleases[0]) : freshReleases[0]
  } else {
    const ordered = [...pool].sort(byOldestPost)
    listing = (topicText ? ordered.find(matchesTopic) : null) ?? ordered[0] ?? null
  }

  if (!listing) return null
  return { listing, justReleased: isFreshRelease(listing) }
}

export async function generateMarketingDraft(input: MarketingDraftInput) {
  const channel = input.channel
  const targetJid = input.target_jid ? String(input.target_jid).slice(0, 120) : null
  const topic = input.topic?.trim() ? input.topic.trim().slice(0, 120) : 'auto'
  const auto = input.auto !== false

  const admin = createAdminClient()

  const pick = await pickListing(admin, topic, channel, { allowRecent: !auto })
  // Automatic slots must feature a real available house. Posting a generic
  // brand status every cycle is what repeated one status more than 10 times.
  if (auto && !pick) return null

  const listing = pick?.listing ?? null
  const justReleased = pick?.justReleased ?? false
  const facts = listing ? listingFacts(listing, justReleased) : null
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
      justReleased: false,
    }
  )

  const meta = {
    headline: aiDraft?.headline || facts?.title || null,
    subline: aiDraft?.subline || facts?.location || null,
    source: aiDraft ? 'ai' : 'template',
    topic,
    just_released: justReleased,
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
   *
   * Before the autonomy migration the column still holds `active`/`paused`;
   * autonomy is then encoded as `active` + require_approval = false.
   */
  const mode =
    control?.mode === 'active'
      ? control?.require_approval === false
        ? 'autonomous'
        : 'regular'
      : control?.mode

  const requireApproval =
    mode === 'autonomous'
      ? false
      : mode === 'regular'
        ? true
        : control?.require_approval !== false

  const rawBody = aiDraft?.body || fallback
  const body =
    justReleased && !/just[\s-]*released/i.test(rawBody.slice(0, 120))
      ? `🔥 *Just released*\n\n${rawBody}`
      : rawBody

  const { data: draft, error } = await admin
    .from('whatsapp_marketing')
    .insert({
      channel,
      target_jid: targetJid,
      body: body.slice(0, 3000),
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
