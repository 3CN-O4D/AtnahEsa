import { createAdminClient } from '@/lib/supabase/admin'
import type { HouseCardData } from './types'

interface RawListing {
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
  { re: /\b(?:one\s*bdrm?|1\s*bed|1br)\b/i, label: '1BR' },
  { re: /\b(?:two\s*bdrm?|2\s*bed|2br)\b/i, label: '2BR' },
  { re: /\b(?:three\s*bdrm?|3\s*bed|3br)\b/i, label: '3BR' },
  { re: /\b(?:four\s*bdrm?|4\s*bed|4br)\b/i, label: '4BR' },
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
  const text = input.replace(/[,\s]/g, '')
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
      .replace(/\b(?:with|water|rent|inclusive|included|self|contained|bedroom|studio|bedsitter|floor|house|homes?|apartments?|area|town|place|near|around|under|below|up\s*to|between|to|and)\b/gi, ' ')
      .replace(/\d+k?/gi, ' ')
      .replace(/[^a-z\s-]/gi, ' ')
    return cleaned.split(/\s+/).filter((w) => w.length >= 4).map((w) => w.toLowerCase())
  })
  for (const w of locationWords) if (!locations.includes(w)) locations.push(w)

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
    includeTaken: /(taken|occupied|all houses|show everything)/i.test(text),
  }
}

function listingTokens(l: RawListing): string {
  return `${l.title ?? ''} ${l.location ?? ''} ${l.descriptive_location ?? ''}`.toLowerCase()
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

  const rent = l.rent ?? 0
  if (q.rent.min !== null && q.rent.max !== null) {
    if (rent >= q.rent.min && rent <= q.rent.max) score += 6
    else if (rent > 0 && rent <= q.rent.max * 1.2) score += 2
  } else if (q.rent.max !== null && rent > 0 && rent <= q.rent.max) {
    score += 4
  } else if (q.rent.min !== null && rent > 0 && rent >= q.rent.min) {
    score += 4
  }

  if (q.locations.length === 0 && q.bedrooms.length === 0 && !q.waterIncluded && !q.selfContained && q.rent.min === null) {
    score += 1 // generic browse
  }

  if (l.status === 'published') score += 1.5
  return score
}

export async function searchHouses(queryText: string, limit = 5): Promise<{ cards: HouseCardData[]; total: number; takenNote: string }> {
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

  const raw = (data ?? []) as RawListing[]
  const scored = raw
    .map((l) => ({ l, score: scoreListing(l, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.l.status === 'published' ? -1 : 1) - (b.l.status === 'published' ? -1 : 1))

  const top = scored.slice(0, limit)
  const cards: HouseCardData[] = top.map(({ l }) => ({
    id: l.id,
    title: l.title ?? 'Untitled house',
    location: l.location ?? 'Unknown area',
    descriptive_location: l.descriptive_location,
    rent: l.rent ?? 0,
    price: l.price ?? 0,
    house_type: l.house_type,
    water: l.water,
    deposit: l.deposit,
    deposit_refundable: l.deposit_refundable,
    vacancy: l.vacancy,
    status: l.status,
    image: (l.images ?? [])[0] ?? null,
    badges: buildBadges(l),
  }))

  const takenCount = scored.filter((s) => s.l.status === 'taken').length
  return {
    cards,
    total: scored.length,
    takenNote: takenCount > 0 && !q.includeTaken ? `${takenCount} similar house${takenCount === 1 ? ' is' : 's are'} already taken — I've left those out.` : '',
  }
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
