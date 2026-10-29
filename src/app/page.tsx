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
  const [isLister, setIsLister] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats] = useState({ available: 0, total: 0, pending: 0, taken: 0 })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user ? { id: data.user.id } : null)
      if (data.user) {
        try {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
          setIsLister(profile?.role === 'lister' || profile?.role === 'admin')
        } catch {}
      }
    })
    // Fetch stats for all statuses using count endpoint (avoids 12-item page cap)
    const fetchStatusCount = async (status: string): Promise<number> => {
      try {
        const res = await fetch(`/api/listings?count=1&status=${status}`)
        if (!res.ok) return 0
        const data = await res.json()
        return typeof data?.count === 'number' ? data.count : 0
      } catch {
        return 0
      }
    }
    Promise.all([
      fetchStatusCount('published'),
      fetchStatusCount('taken'),
      fetchStatusCount('booked'),
    ]).then(([published, taken, booked]) => {
      setStats({
        available: published,
        total: published + taken + booked,
        pending: 0,
        taken: taken + booked,
      })
    }).catch(() => {})
  }, [])

  const fetchListings = useCallback(
    async (page: number): Promise<Listing[]> => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('status', 'published')
      if (query) params.set('query', query)
      if (sort) params.set('sort', sort)
      if (filters.location) params.set('location', filters.location)
      if (filters.minRent) params.set('minRent', filters.minRent)
      if (filters.maxRent) params.set('maxRent', filters.maxRent)
      if (filters.minPrice) params.set('minPrice', filters.minPrice)
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
      if (filters.issues !== undefined && filters.issues !== '') {
        params.set('issues', filters.issues)
      }

      try {
        const res = await fetch(`/api/listings?${params.toString()}`, {
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) {
          console.error(`API error: ${res.status} ${res.statusText}`)
          throw new Error(`Failed to load listings: ${res.status}`)
        }
        const data = await res.json()
        console.log(`Fetched page ${page}:`, data?.length || 0, 'listings')
        return (data ?? []) as Listing[]
      } catch (err) {
        console.error('fetchListings error:', err)
        return []
      }
    },
    [query, sort, filters]
  )

  const listAHouseLink = user ? '/upload' : '/auth/signup?role=lister'

  const countAvailable = useCountUp(stats.available)
  const countTotal = useCountUp(stats.total)
  const countPending = useCountUp(stats.pending)
  const countTaken = useCountUp(stats.taken)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero section */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fadeIn animate-slideUp" style={{ animationDelay: '0.1s' }}>
        <div>
          <h1 className="text-3xl font-bold dark:text-white mb-2">
            Find Your Perfect Home and <span className="text-[#30B54A]">Get Connected</span>
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Browse verified listings, book, move in and get connected with ease.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link href="/request-house" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#30B54A] text-white rounded-lg text-sm font-semibold hover:bg-[#2a9c40] transition-colors self-start w-auto active:scale-95">
            <Search className="w-4 h-4" /> Request a House
          </Link>
          <Link href={listAHouseLink} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shrink-0 self-start w-auto animate-float active:scale-95">
            + List a House
          </Link>
          {isLister && (
            <Link href="/requests" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border-2 border-[#30B54A] text-[#2a9c40] rounded-lg text-sm font-semibold hover:bg-[#e8f8eb] transition-colors shrink-0 self-start w-auto active:scale-95">
              House Requests
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-fadeIn animate-slideUp" style={{ animationDelay: '0.2s' }}>
        <div className="bg-[#e8f8eb] dark:bg-[#30B54A]/20 border border-[#30B54A] dark:border-[#30B54A]/50 rounded-xl p-4 text-center animate-scaleIn" style={{ animationDelay: '0.1s' }}>
          <p className="text-2xl font-bold text-[#30B54A] dark:text-[#6fdc84]">{countAvailable}</p>
          <p className="text-xs text-[#30B54A] dark:text-[#6fdc84] font-medium">Available Houses</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 text-center animate-scaleIn" style={{ animationDelay: '0.15s' }}>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{countTotal}</p>
          <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">Total Listings</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4 text-center animate-scaleIn" style={{ animationDelay: '0.15s' }}>
          <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{countPending}</p>
          <p className="text-xs text-yellow-600 dark:text-yellow-300 font-medium">Pending</p>
        </div>
        <Link href="/taken" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700/50 rounded-xl p-4 text-center hover:shadow-md transition-shadow animate-scaleIn" style={{ animationDelay: '0.3s' }}>
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
