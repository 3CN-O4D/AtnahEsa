'use client'

import { useState, useCallback } from 'react'
import ListingGrid from '@/components/listings/ListingGrid'
import SearchBar from '@/components/listings/SearchBar'
import SortDropdown from '@/components/listings/SortDropdown'
import FilterPanel from '@/components/listings/FilterPanel'
import { createClient } from '@/lib/supabase/client'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { Listing } from '@/types'

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)

  const fetchListings = useCallback(
    async (page: number): Promise<Listing[]> => {
      const supabase = createClient()

      let q = supabase
        .from('listings')
        .select('*')
        .eq('status', 'published')
        .range((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE - 1)

      // Search by location or title
      if (query) {
        const conditions = [`location.ilike.*${query}*`, `title.ilike.*${query}*`]
        const num = parseInt(query)
        if (!isNaN(num)) {
          conditions.push(`price.eq.${num}`, `rent.eq.${num}`)
        }
        q = q.or(conditions.join(','))
      }

      // Filters
      if (filters.location) {
        q = q.ilike('location', `%${filters.location}%`)
      }
      if (filters.minRent) {
        q = q.gte('rent', parseInt(filters.minRent))
      }
      if (filters.maxRent) {
        q = q.lte('rent', parseInt(filters.maxRent))
      }
      if (filters.minPrice) {
        q = q.gte('price', parseInt(filters.minPrice))
      }
      if (filters.maxPrice) {
        q = q.lte('price', parseInt(filters.maxPrice))
      }
      if (filters.issues !== undefined && filters.issues !== '') {
        q = q.eq('issues_count', parseInt(filters.issues))
      }

      // Sort
      if (sort) {
        const sortMap: Record<string, { column: string; ascending: boolean }> = {
          rent_asc: { column: 'rent', ascending: true },
          rent_desc: { column: 'rent', ascending: false },
          price_asc: { column: 'price', ascending: true },
          price_desc: { column: 'price', ascending: false },
          location: { column: 'location', ascending: true },
          issues_asc: { column: 'issues_count', ascending: true },
          issues_desc: { column: 'issues_count', ascending: false },
        }
        const s = sortMap[sort]
        if (s) q = q.order(s.column, { ascending: s.ascending })
      } else {
        q = q.order('created_at', { ascending: false })
      }

      const { data } = await q
      return (data ?? []) as Listing[]
    },
    [query, sort, filters]
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Find Your Perfect Home
        </h1>
        <p className="text-gray-600">
          Browse verified listings, book viewings, and move in with ease.
        </p>
      </div>

      {/* Search + Sort + Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchBar onSearch={setQuery} onToggleFilters={() => setShowFilters(!showFilters)} />
          </div>
          <SortDropdown value={sort} onChange={setSort} />
        </div>

        {showFilters && <FilterPanel onApply={setFilters} />}
      </div>

      {/* Listing grid with infinite scroll */}
      <ListingGrid fetchListings={fetchListings} sort={sort} filters={filters} query={query} />
    </div>
  )
}
