'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import ListingGrid from '@/components/listings/ListingGrid'
import SearchBar from '@/components/listings/SearchBar'
import SortDropdown from '@/components/listings/SortDropdown'
import FilterPanel from '@/components/listings/FilterPanel'
import { createClient } from '@/lib/supabase/client'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import { useCountUp } from '@/hooks/useCountUp'
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
    Promise.all([
      supabase.from('listings').select('status'),
      supabase.from('listings').select('vacancy').eq('status', 'published'),
    ]).then(([statusRes, vacancyRes]) => {
      if (statusRes.error) { console.error('Stats query error:', statusRes.error); return }
      const statusData = statusRes.data
      const vacancyData = vacancyRes.data
      if (!statusData) return
      let available = 0, pending = 0, taken = 0
      for (const row of statusData) {
        if (row.status === 'published') available++
        else if (row.status === 'taken') taken++
      }
      if (vacancyData) {
        pending = vacancyData.filter((r) => r.vacancy === 'pending').length
      }
      setStats({ available, pending, taken })
    }).catch((err) => console.error('Stats fetch failed:', err))
  }, [])

  const fetchListings = useCallback(
    async (page: number): Promise<Listing[]> => {
      const supabase = createClient()

      let q = supabase
        .from('listings')
        .select('*')
        .in('status', ['published', 'taken'])
        .order('status', { ascending: true })
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

  const countAvailable = useCountUp(stats.available)
  const countPending = useCountUp(stats.pending)
  const countTaken = useCountUp(stats.taken)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero section */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-white mb-2">
            Find Your Perfect Home and <span className="text-[#30B54A]">Get Connected</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Browse verified listings, book, move in and get connected with ease.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link href="/request-house" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#30B54A] text-white rounded-lg text-sm font-semibold hover:bg-[#2a9c40] transition-colors self-start w-auto">
            <Search className="w-4 h-4" /> Request a House
          </Link>
          <Link href={listAHouseLink} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shrink-0 self-start w-auto">
            + List a House
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-[#e8f8eb] dark:bg-[#30B54A]/20 border border-[#30B54A] dark:border-[#30B54A]/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#30B54A] dark:text-[#6fdc84]">{countAvailable}</p>
          <p className="text-xs text-[#30B54A] dark:text-[#6fdc84] font-medium">Available Houses</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4 text-center" style={{ animationDelay: '0.1s' }}>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{countPending}</p>
          <p className="text-xs text-yellow-600 dark:text-yellow-300 font-medium">Pending</p>
        </div>
        <Link href="/taken" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-xl p-4 text-center hover:shadow-md transition-shadow" style={{ animationDelay: '0.2s' }}>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">{countTaken}</p>
          <p className="text-xs text-red-600 dark:text-red-300 font-medium">Taken Houses</p>
        </Link>
      </div>

      {/* Search + Sort + Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchBar onSearch={setQuery} onToggleFilters={() => setShowFilters(!showFilters)} />
          </div>
          <SortDropdown value={sort} onChange={setSort} />
        </div>

        {showFilters && <div className="animate-fadeIn"><FilterPanel onApply={setFilters} /></div>}
      </div>

      {/* Listing grid with infinite scroll */}
      <ListingGrid fetchListings={fetchListings} sort={sort} filters={filters} query={query} />
    </div>
  )
}
