'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import ListingGrid from '@/components/listings/ListingGrid'
import SearchBar from '@/components/listings/SearchBar'
import SortDropdown from '@/components/listings/SortDropdown'
import FilterPanel from '@/components/listings/FilterPanel'
import { createClient } from '@/lib/supabase/client'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { Listing } from '@/types'

export default function HomePage() {
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats] = useState({ available: 0, pending: 0, taken: 0 })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null))
    supabase.from('listings').select('status').then(({ data }) => {
      if (!data) return
      let available = 0, pending = 0, taken = 0
      for (const row of data) {
        if (row.status === 'published') available++
        else if (row.status === 'pending') pending++
        else if (row.status === 'taken') taken++
      }
      setStats({ available, pending, taken })
    })
  }, [])

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

  const listAHouseLink = user ? '/upload' : '/auth/signup?role=lister'

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero section */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Find Your Perfect Home
          </h1>
          <p className="text-gray-600">
            Browse verified listings, book viewings, and move in with ease.
          </p>
        </div>
        <Link href={listAHouseLink} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shrink-0 self-start w-auto">
          + List a House
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.available}</p>
          <p className="text-xs text-green-600 font-medium">Available Houses</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
          <p className="text-xs text-yellow-600 font-medium">Pending</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.taken}</p>
          <p className="text-xs text-blue-600 font-medium">Taken</p>
        </div>
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
