import type { SupabaseClient } from '@supabase/supabase-js'
import type { Listing } from '@/types'

/**
 * Shared listing-feed queries.
 *
 * The home page is rendered on the server and the paginated API serves later
 * pages, so both must agree on the exact columns, filters and the
 * published -> booked -> taken grouping. Keeping that logic here avoids the
 * two copies drifting apart (which would make page 2 look different from the
 * server-rendered page 1).
 */

/** Columns the public cards actually read. Keeping this list tight makes each
 *  page noticeably smaller over the wire and avoids leaking private fields. */
export const PUBLIC_LISTING_COLUMNS = [
  'id',
  'title',
  'description',
  'price',
  'rent',
  'location',
  'images',
  'issues',
  'issues_count',
  'deposit',
  'deposit_refundable',
  'electricity',
  'electric_bill',
  'water',
  'why_vacant',
  'vacancy',
  'vacancy_type',
  'house_type',
  'building_type',
  'floor_number',
  'descriptive_location',
  'payment_method',
  'status',
  'taken_at',
  'uploader_id',
  'uploader_name',
  'created_at',
  'updated_at',
].join(',')

/** Home always shows new homes first, then booked, then taken. */
export const LISTING_STATUS_ORDER = ['published', 'booked', 'taken'] as const

export type ListingStatusGroup = (typeof LISTING_STATUS_ORDER)[number]

export const LISTING_SORT_RULES: Record<string, { column: string; ascending: boolean }> = {
  rent_asc: { column: 'rent', ascending: true },
  rent_desc: { column: 'rent', ascending: false },
  price_asc: { column: 'price', ascending: true },
  price_desc: { column: 'price', ascending: false },
  location: { column: 'location', ascending: true },
  issues_asc: { column: 'issues_count', ascending: true },
  issues_desc: { column: 'issues_count', ascending: false },
}

export interface ListingsFeedParams {
  page?: number | string
  pageSize?: number
  query?: string
  sort?: string
  location?: string
  minRent?: string
  maxRent?: string
  minPrice?: string
  maxPrice?: string
  issues?: string
}

type Filterable<T> = T & {
  or: (filter: string) => T
  ilike: (column: string, value: string) => T
  gte: (column: string, value: number) => T
  lte: (column: string, value: number) => T
  eq: (column: string, value: number) => T
}

function applyFilters<T>(q: T, params: ListingsFeedParams): T {
  let next = q as Filterable<T>
  const { query, location, minRent, maxRent, minPrice, maxPrice, issues } = params
  if (query) {
    const sanitized = query.replace(/[%_]/g, '').slice(0, 100)
    next = next.or(`location.ilike.*${sanitized}*,title.ilike.*${sanitized}*`) as Filterable<T>
  }
  if (location) next = next.ilike('location', `%${location.replace(/[%_]/g, '').slice(0, 100)}%`) as Filterable<T>
  if (minRent) next = next.gte('rent', parseInt(minRent)) as Filterable<T>
  if (maxRent) next = next.lte('rent', parseInt(maxRent)) as Filterable<T>
  if (minPrice) next = next.gte('price', parseInt(minPrice)) as Filterable<T>
  if (maxPrice) next = next.lte('price', parseInt(maxPrice)) as Filterable<T>
  if (issues) next = next.eq('issues_count', parseInt(issues)) as Filterable<T>
  return next as T
}

/** Apply the filters + chosen sort to one status group (newest first by default). */
function buildGroupPage(
  supabase: SupabaseClient,
  group: ListingStatusGroup,
  from: number,
  to: number,
  params: ListingsFeedParams
) {
  const base = supabase.from('listings').select(PUBLIC_LISTING_COLUMNS).in('status', [group])
  const filtered = applyFilters(base, params)
  const rule = params.sort ? LISTING_SORT_RULES[params.sort] : undefined
  const ordered = rule
    ? filtered.order(rule.column, { ascending: rule.ascending })
    : filtered.order('created_at', { ascending: false })
  return ordered.range(from, to)
}

/**
 * One contiguous block per status, in LISTING_STATUS_ORDER. Counts let us page
 * through that virtual combined list without a database migration or loading
 * every row into memory.
 */
export async function fetchGroupedListingsPage(
  supabase: SupabaseClient,
  params: ListingsFeedParams = {},
  knownCounts?: Record<ListingStatusGroup, number>
): Promise<Listing[]> {
  const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 8))
  const pageNum = Math.max(1, parseInt(String(params.page ?? 1), 10) || 1)
  const windowStart = (pageNum - 1) * pageSize
  const windowEnd = windowStart + pageSize

  const counts = knownCounts ?? (await fetchListingGroupCounts(supabase, params))

  const rows: Listing[] = []
  let groupStart = 0
  for (const group of LISTING_STATUS_ORDER) {
    const groupCount = counts[group] ?? 0
    const groupEnd = groupStart + groupCount
    if (groupCount > 0 && windowEnd > groupStart && windowStart < groupEnd) {
      const localFrom = Math.max(0, windowStart - groupStart)
      const localTo = Math.min(groupCount, windowEnd - groupStart) - 1
      const { data, error } = await buildGroupPage(supabase, group, localFrom, localTo, params)
      if (error) throw new Error(error.message)
      if (data) rows.push(...(data as unknown as Listing[]))
    }
    groupStart = groupEnd
  }
  return rows
}

/** Exact counts per status for the same filters, used by the hero stats. */
export async function fetchListingGroupCounts(
  supabase: SupabaseClient,
  params: ListingsFeedParams = {}
): Promise<Record<ListingStatusGroup, number>> {
  const results = await Promise.all(
    LISTING_STATUS_ORDER.map((group) => {
      const base = supabase.from('listings').select('*', { count: 'exact', head: true }).in('status', [group])
      return applyFilters(base, params)
    })
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const map = {} as Record<ListingStatusGroup, number>
  results.forEach((result, index) => {
    map[LISTING_STATUS_ORDER[index]] = result.count ?? 0
  })
  return map
}
