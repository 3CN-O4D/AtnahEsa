import { createAdminClient } from '@/lib/supabase/admin'
import type { HouseCardData, HouseSearchSnapshot } from './types'

export interface RawListing {
  id: string
  title: string
  location: string | null
  descriptive_location: string | null
  rent: number | null
  price: number | null
  house_type: string | null
  building_type: string | null
  water: string | null
  deposit: number | null
  deposit_refundable: boolean | null
  vacancy: string | null
  status: string
  images: string[] | null
  issues_count: number | null
  created_at: string | null
}

const BEDROOM_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\b(?:one\s*(?:bed(?:room)?s?|bdrm?)|1\s*(?:bed(?:room)?s?|bdrm?)|1br)\b/i, label: '1BR' },
  { re: /\b(?:two\s*(?:bed(?:room)?s?|bdrm?)|2\s*(?:bed(?:room)?s?|bdrm?)|2br)\b/i, label: '2BR' },
  { re: /\b(?:three\s*(?:bed(?:room)?s?|bdrm?)|3\s*(?:bed(?:room)?s?|bdrm?)|3br)\b/i, label: '3BR' },
  { re: /\b(?:four\s*(?:bed(?:room)?s?|bdrm?)|4\s*(?:bed(?:room)?s?|bdrm?)|4br)\b/i, label: '4BR' },
  { re: /\b(?:five\s*(?:bed(?:room)?s?|bdrm?)|5\s*(?:bed(?:room)?s?|bdrm?)|5br)\b/i, label: '5BR' },
  { re: /\bbedsitter\b/i, label: 'Bedsitter' },
  { re: /\bstudio\b/i, label: 'Studio' },
  { re: /\bbungalow\b/i, label: 'Bungalow' },
  { re: /\btownhouse\b/i, label: 'Townhouse' },
]

const WATER_INCLUDED_RE = /(?:water|rent)[^.]{0,20}(?:included|inclusive|incl)|(?:included|inclusive)[^.]{0,20}rent/i
const SELF_CONTAINED_RE = /self[-\s]?contained|selfcontained/i
const GROUND_FLOOR_RE = /ground\s*floor|\bflat\b/i
const STOREY_RE = /storey|upstairs/i
const NO_ISSUES_RE = /(?:no|zero|without)\s+issues|issues?\s+free/i

/** Pull rent amounts like "under 10k", "15k - 25k", "15000", "10,000 to 20,000". */
export function extractRentRange(input: string): { min: number | null; max: number | null } {
  // Bedroom counts are not money: "2 bedrooms under 15k" must parse as max 15k only.
  const withoutBedrooms = input.replace(
    /\b(?:one|two|three|four|five|six|\d+)\s*(?:bed(?:room)?s?|bdrm?|br)\b/gi,
    ' '
  )
  const text = withoutBedrooms.replace(/[,\s]/g, '')
  // currency tokens: 10k / 10,000 / 10000 / 1.5k
  const amounts = [...text.matchAll(/(\d+(?:\.\d+)?)k?/gi)].map((m) => {
    const raw = m[1]
    const precededByK = /k/i.test(text.slice(Math.max(0, m.index! - 1), m.index! + m[0].length))
    const isKsh = text.slice(Math.max(0, m.index! - 6), m.index!).includes('ksh') || text.slice(Math.max(0, m.index! - 5), m.index!).includes('kes')
    void isKsh
    return precededByK || /[km]/i.test(m[0]) ? Number(parseFloat(raw) * 1000) : Number(parseFloat(raw))
  }).filter((n) => n >= 300 && n <= 2_000_000)

  if (amounts.length === 0) return { min: null, max: null }
  if (amounts.length === 1) {
    // "under 15k", "below 15k" → max; "from 15k", "above 15k", "at least" → min
    if (/(under|below|less than|max|up to|not more than)/i.test(input)) return { min: null, max: amounts[0] }
    if (/(from|above|over|at least|min)/i.test(input)) return { min: amounts[0], max: null }
    return { min: amounts[0] * 0.8, max: amounts[0] * 1.2 }
  }
  const sorted = [...amounts].sort((a, b) => a - b)
  return { min: sorted[0], max: sorted[sorted.length - 1] }
}

/** "send me 2 houses", "one in Juniorate" → 2 / 1. Rooms and prices don't count. */
export function extractRequestedCount(input: string): number | null {
  const cleaned = input
    .replace(/\b(?:one|two|three|four|five|six|\d+)\s*(?:bed(?:room)?s?|bdrm?|br)\b/gi, ' ')
    .replace(/\b(?:ksh|kes)\s*\d+(?:\.\d+)?k?\b/gi, ' ')
    .replace(/\d+(?:\.\d+)?k\b/gi, ' ')

  const numberWord = cleaned.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i)
  const digitCount = cleaned.match(
    /\b(\d{1,2})\b(?=\s+(?:houses?|homes?|rooms?|apartments?|options?|listings?|places?|in|at|near|around|from|for|please))/i
  )
  const found = numberWord || digitCount
  if (!found) return null
  const words: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12,
  }
  const value = /^\d+$/.test(found[1]) ? Number(found[1]) : words[found[1].toLowerCase()]
  if (!Number.isFinite(value) || value < 1) return null
  return Math.min(10, value)
}

export interface HouseSearchQuery {
  raw: string
  locations: string[]
  bedrooms: string[]
  waterIncluded: boolean
  selfContained: boolean
  groundFloor: boolean
  storey: boolean
  noIssues: boolean
  rent: { min: number | null; max: number | null }
  /** Price direction matters for "cheapest" and "most expensive" requests. */
  sort: 'relevance' | 'price_asc' | 'price_desc'
  /** Exact number of houses requested, e.g. "send me 2 houses". */
  count: number | null
  includeTaken: boolean
}

export function parseHouseQuery(input: string): HouseSearchQuery {
  const text = input
  const locations: string[] = []
  const bedroomLabels: string[] = []
  for (const p of BEDROOM_PATTERNS) {
    if (p.re.test(text) && !bedroomLabels.includes(p.label)) bedroomLabels.push(p.label)
  }

  // Split on "or" / "and" to catch multiple areas like "Kipkaren or Annex".
  const segments = text.split(/\bor\b|\band\b|\bin\b|around|near|within/gi).map((s) => s.trim())
  const locationWords = segments.flatMap((seg) => {
    const cleaned = seg
      .replace(
        /\b(?:find|search|show|send|give|get|me|please|want|need|looking|look|some|any|the|a|an|with|without|water|rent|price|inclusive|included|self|contained|bedroom|bedrooms|bed|beds|studio|bedsitter|floor|house|houses|home|homes|apartment|apartments|room|rooms|area|town|place|near|around|within|under|below|above|over|from|between|up\s*to|not\s*more\s*than|at\s*least|max|minimum|min|cheap|cheapest|lowest|affordable|expensive|least|most|best|budget|per|month|mo|available|vacant|taken|occupied|everything|all|more|another|other|only|just|do|you|have|is|there|what|which|where)\b/gi,
        ' '
      )
      .replace(/\d+(?:\.\d+)?k?\b/gi, ' ')
      .replace(/[^a-z\s-]/gi, ' ')
    return cleaned.split(/\s+/).filter((w) => w.length >= 4).map((w) => w.toLowerCase())
  })
  for (const w of locationWords) if (!locations.includes(w)) locations.push(w)

  let sort: HouseSearchQuery['sort'] = 'relevance'
  if (/\b(?:cheap(?:est)?|lowest|affordable|least\s+expensive|best\s+price|low\s+price|small\s+budget)\b/i.test(text)) {
    sort = 'price_asc'
  } else if (/\b(?:most\s+expensive|highest\s+price|top\s+price|luxur(?:y|ious))\b/i.test(text)) {
    sort = 'price_desc'
  }

  return {
    raw: text,
    locations,
    bedrooms: bedroomLabels,
    waterIncluded: WATER_INCLUDED_RE.test(text),
    selfContained: SELF_CONTAINED_RE.test(text),
    groundFloor: GROUND_FLOOR_RE.test(text),
    storey: STOREY_RE.test(text),
    noIssues: NO_ISSUES_RE.test(text),
    rent: extractRentRange(text),
    sort,
    count: extractRequestedCount(text),
    includeTaken: /(taken|occupied|all houses|show everything)/i.test(text),
  }
}

function listingTokens(l: RawListing): string {
  return `${l.title ?? ''} ${l.location ?? ''} ${l.descriptive_location ?? ''}`.toLowerCase()
}

function matchesLocations(l: RawListing, q: HouseSearchQuery): boolean {
  if (q.locations.length === 0) return true
  const hay = listingTokens(l)
  return q.locations.some((loc) => {
    const boundary = new RegExp(`(^|[^a-z])${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i')
    return boundary.test(hay) || hay.includes(loc)
  })
}

/** Score how well a listing matches a parsed query. Higher is better. */
export function scoreListing(l: RawListing, q: HouseSearchQuery): number {
  let score = 0
  const hay = listingTokens(l)

  for (const loc of q.locations) {
    const wordBoundary = new RegExp(`(^|[^a-z])${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i')
    if (wordBoundary.test(hay)) score += 12
    else if (hay.includes(loc)) score += 6
  }

  for (const b of q.bedrooms) {
    const label = b.replace('BR', 'br').replace(/\b([0-9])br\b/i, '$1BR')
    const type = (l.house_type ?? '').toLowerCase()
    if (type.includes(label.toLowerCase()) || (l.title ?? '').toLowerCase().includes(label.toLowerCase())) score += 8
  }

  const water = (l.water ?? '').toLowerCase()
  if (q.waterIncluded && (water === 'included' || water.includes('included') || water.includes('inclusive'))) score += 8
  if (q.waterIncluded && water && water !== 'included' && !water.includes('included')) score -= 2

  if (q.selfContained) {
    if (/(self|contained|inclusive)/.test(hay) || (l.house_type ?? '').toLowerCase().includes('studio')) score += 5
  }

  const building = (l.building_type ?? '').toLowerCase()
  const loc = (l.location ?? '').toLowerCase()
  if (q.groundFloor && (building.includes('ground') || building.includes('flat') || loc.includes('ground'))) score += 4
  if (q.storey && (building.includes('storey') || building.includes('upstairs'))) score += 4
  if (q.noIssues && (l.issues_count ?? 0) === 0) score += 4

  const rent = l.rent ?? l.price ?? 0
  if (q.rent.min !== null && q.rent.max !== null) {
    if (rent >= q.rent.min && rent <= q.rent.max) score += 12
  } else if (q.rent.max !== null) {
    // Budget is a hard requirement — reward every house that actually fits.
    if (rent > 0 && rent <= q.rent.max) score += 10 + Math.min(4, (q.rent.max - rent) / q.rent.max * 4)
  } else if (q.rent.min !== null) {
    if (rent > 0 && rent >= q.rent.min) score += 10
  }

  if (q.locations.length === 0 && q.bedrooms.length === 0 && !q.waterIncluded && !q.selfContained && q.rent.min === null) {
    score += 1 // generic browse
  }

  if (l.status === 'published') score += 1.5
  return score
}

export interface HouseSearchOutput {
  cards: HouseCardData[]
  total: number
  takenNote: string
  /** Structured results kept in chat state for sorting/follow-ups. */
  snapshot: HouseSearchSnapshot
}

const rentOf = (l: RawListing) => l.rent ?? l.price ?? 0

function toCard(l: RawListing): HouseCardData {
  return {
    id: l.id,
    title: l.title ?? 'Untitled house',
    location: l.location ?? 'Unknown area',
    descriptive_location: l.descriptive_location,
    rent: rentOf(l),
    price: l.price ?? l.rent ?? 0,
    house_type: l.house_type,
    water: l.water,
    deposit: l.deposit,
    deposit_refundable: l.deposit_refundable,
    vacancy: l.vacancy,
    status: l.status,
    image: (l.images ?? [])[0] ?? null,
    images: (l.images ?? []).filter(Boolean),
    badges: buildBadges(l),
  }
}

/** Pure ranking step so it can be tested without a database. */
export function rankListings(raw: RawListing[], q: HouseSearchQuery) {
  // A stated budget is a hard limit: never show a card above it (or with no
  // known rent) just because the area matched.
  const withinBudget = raw.filter((l) => {
    if (q.rent.min === null && q.rent.max === null) return true
    const rent = rentOf(l)
    if (rent <= 0) return false
    if (q.rent.max !== null && rent > q.rent.max) return false
    if (q.rent.min !== null && rent < q.rent.min) return false
    return true
  })

  // Explicit areas are a strong preference: "cheapest in Juniorate" must not
  // become "cheapest anywhere". Fall back to all budget matches only when the
  // named area has no live houses.
  const areaMatches = q.locations.length ? withinBudget.filter((l) => matchesLocations(l, q)) : withinBudget
  const pool = areaMatches.length ? areaMatches : withinBudget
  return pool
    .map((l) => ({ l, score: scoreListing(l, q) }))
    .filter((s) => s.score > 0 || (areaMatches.length === 0 && q.locations.length > 0))
    .sort((a, b) => {
      const rentA = rentOf(a.l)
      const rentB = rentOf(b.l)
      if (q.sort === 'price_asc' || q.sort === 'price_desc') {
        const aArea = matchesLocations(a.l, q)
        const bArea = matchesLocations(b.l, q)
        if (aArea !== bArea) return aArea ? -1 : 1
        const price = q.sort === 'price_asc' ? rentA - rentB : rentB - rentA
        if (price !== 0) return price
      }
      const byScore = b.score - a.score
      if (byScore !== 0) return byScore
      const aPublished = a.l.status === 'published' ? 1 : 0
      const bPublished = b.l.status === 'published' ? 1 : 0
      if (aPublished !== bPublished) return bPublished - aPublished
      return rentA - rentB
    })
}

/** Pure result builder: caps the visible batch at the requested count. */
export function buildHouseSearchOutput(
  raw: RawListing[],
  queryText: string,
  limit = 5
): HouseSearchOutput {
  const q = parseHouseQuery(queryText)
  const scored = rankListings(raw, q)
  const safeLimit = Math.max(1, Math.min(10, q.count ?? (Math.floor(limit) || 5)))
  const results = scored.slice(0, Math.max(25, safeLimit + 10)).map(({ l, score }) => ({ card: toCard(l), score, rent: rentOf(l) }))
  const cards = results.slice(0, safeLimit).map((r) => r.card)
  const takenCount = scored.filter((s) => s.l.status === 'taken').length
  const takenNote =
    takenCount > 0 && !q.includeTaken
      ? `${takenCount} similar house${takenCount === 1 ? ' is' : 's are'} already taken — I've left those out.`
      : ''

  return {
    cards,
    total: scored.length,
    takenNote,
    snapshot: {
      query: queryText,
      filters: {
        locations: q.locations,
        bedrooms: q.bedrooms,
        rent: q.rent,
        sort: q.sort,
        count: q.count,
      },
      total: scored.length,
      results,
      shown: cards.length,
      pageSize: safeLimit,
      capturedAt: new Date().toISOString(),
      takenNote,
    },
  }
}

export async function searchHouses(queryText: string, limit = 5): Promise<HouseSearchOutput> {
  const q = parseHouseQuery(queryText)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('listings')
    .select('id,title,location,descriptive_location,rent,price,house_type,building_type,water,deposit,deposit_refundable,vacancy,status,images,issues_count,created_at')
    .in('status', q.includeTaken ? ['published', 'booked', 'taken'] : ['published', 'booked'])
    .limit(200)

  if (error) {
    throw new Error(`Search failed: ${error.message}`)
  }

  return buildHouseSearchOutput((data ?? []) as RawListing[], queryText, limit)
}

function buildBadges(l: RawListing): string[] {
  const badges: string[] = []
  const type = (l.house_type ?? '').trim()
  if (type) badges.push(type)
  if ((l.water ?? '').toLowerCase().includes('includ') || (l.water ?? '').toLowerCase() === 'included') badges.push('Water incl.')
  if (l.deposit_refundable) badges.push('Refundable deposit')
  if (l.vacancy === 'vacant' || l.vacancy === 'available') badges.push('Available now')
  if (l.status === 'booked') badges.push('Being viewed')
  if (l.status === 'taken') badges.push('Taken')
  return badges
}
