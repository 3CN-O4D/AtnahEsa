'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import ListingCard from './ListingCard'
import { Home, Wifi, Search, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Listing } from '@/types'

interface ListingGridProps {
  fetchListings: (page: number) => Promise<Listing[]>
  sort?: string
  filters?: Record<string, string>
  query?: string
}

interface ListerInfo {
  full_name: string | null
  role: string | null
  verified: boolean | null
}

export default function ListingGrid({ fetchListings, sort, filters, query }: ListingGridProps) {
  const [listings, setListings] = useState<Listing[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [listerInfo, setListerInfo] = useState<Map<string, ListerInfo>>(new Map())
  const loaderRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const mountedRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const data = await fetchListings(page)
      if (!mountedRef.current) return

      if (data.length === 0) {
        setHasMore(false)
      } else {
        setListings((prev) => {
          const existing = new Set(prev.map((l) => l.id))
          const unique = data.filter((l) => !existing.has(l.id))
          if (unique.length > 0 && prev.length > 0) {
            setShowSuccess(true)
            setTimeout(() => setShowSuccess(false), 1500)
          }
          return [...prev, ...unique]
        })
        setPage((p) => p + 1)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load listings')
      setHasMore(false)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        loadingRef.current = false
      }
    }
  }, [page, hasMore, fetchListings])

  useEffect(() => {
    mountedRef.current = true
    loadMore()
    return () => { mountedRef.current = false }
  }, [loadMore])

  useEffect(() => {
    setListings([])
    setPage(1)
    setHasMore(true)
    setError(null)
    setLoading(true)
    loadingRef.current = false
  }, [sort, filters, query])

  useEffect(() => {
    const el = loaderRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current && !error) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore, error])

  // Batch-fetch lister profiles for all loaded listings (avoids N+1 per-card fetches)
  useEffect(() => {
    if (!mountedRef.current || listings.length === 0) return

    const uniqueIds = [...new Set(listings.map(l => l.uploader_id).filter(Boolean))] as string[]
    if (uniqueIds.length === 0) return

    const supabase = createClient()
    supabase
      .from('profiles_public')
      .select('id, role, verified, full_name')
      .in('id', uniqueIds)
      .then(({ data }) => {
        if (!mountedRef.current) return
        const map = new Map<string, ListerInfo>()
        for (const p of (data ?? [])) {
          map.set(p.id, {
            full_name: p.full_name ?? null,
            role: p.role ?? null,
            verified: !!p.verified,
          })
        }
        setListerInfo(map)
      })
  }, [listings])

  const retry = () => {
    setError(null)
    setLoading(true)
    loadMore()
  }

  return (
    <div>
      {error && !loading && listings.length === 0 && (
        <div className="text-center py-12 space-y-4 animate-fadeIn animate-slideUp">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900">Failed to load listings</h2>
          <p className="text-gray-600 max-w-md mx-auto">{error}</p>
          <button
            onClick={retry}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {loading && listings.length === 0 && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 py-12">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="animate-slideUp animate-fadeIn" style={{ animationDelay: `${(i % 4) * 0.1}s` }}>
              <div className="skeleton h-96 w-full mb-3" />
              <div className="skeleton h-4 w-3/4 mb-2" />
              <div className="skeleton h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}
      {!loading && listings.length > 0 && (
        <>
          <div className="mb-4 flex items-center gap-2 animate-fadeIn animate-slideUp">
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {listings.length} home{listings.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              &middot; {sort ? sort.replace(/_/g, ' ') : 'Newest first'}
            </span>
            {showSuccess && (
              <span className="ml-auto flex items-center gap-1 text-xs text-green-600 dark:text-green-400 animate-scaleIn animate-fadeIn">
                <Sparkles className="w-3.5 h-3.5" />
                New listings loaded!
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listings.map((listing, i) => {
              const info = listerInfo.get(listing.uploader_id)
              return (
                <div key={listing.id} className="animate-slideUp animate-fadeIn animate-elasticIn" style={{ animationDelay: `${(i % 8) * 0.06}s` }}>
                  <ListingCard
                    listing={listing}
                    listerName={info?.full_name ?? listing.uploader_name ?? ''}
                    isAdmin={info?.role === 'admin'}
                    verified={info?.verified ?? false}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}
      {!hasMore && listings.length === 0 && !loading && !error && (
        <div className="text-center py-12 space-y-6 animate-fadeIn animate-slideUp">
          <div className="space-y-2">
            <div className="animate-bounce-slow inline-block text-4xl mb-3">🏠</div>
            <h2 className="text-xl font-bold text-gray-900">All Houses Are Currently Taken</h2>
            <p className="text-gray-600 max-w-md mx-auto">
              Every available house has been snapped up. We take every request seriously &mdash; tell us what
              you&apos;re looking for and our agents will be on the ground to find it for you.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/request-house">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors tap-scale hover:-translate-y-0.5 hover:shadow-lg">
                <Home className="w-4 h-4" /> Request a House
              </span>
            </Link>
            <Link href="/wifi">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors tap-scale hover:-translate-y-0.5 hover:shadow-lg">
                <Wifi className="w-4 h-4" /> Browse WiFi Packages
              </span>
            </Link>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 max-w-md mx-auto text-left animate-fadeInUp">
            <p className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-2">
              <Wifi className="w-4 h-4" /> While You Wait — Get Internet Ready
            </p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Moving into a new home? Compare the latest WiFi packages from top providers and pick a plan.
              Packages start as low as KES 1,000/month.
            </p>
            <Link href="/wifi" className="text-xs text-blue-600 hover:underline mt-2 inline-block font-medium transition-colors hover:translate-x-1">
              View packages →
            </Link>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Search className="w-3.5 h-3.5" />
            Try adjusting your search or filters, or request a house and we&apos;ll match you.
          </div>
        </div>
      )}
      {hasMore && (
        <div ref={loaderRef} className="flex justify-center py-8">
          {loading && (
            <div className="flex flex-col items-center gap-3 animate-fadeIn">
              <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-sm text-gray-500 animate-pulse-slow">Loading more homes...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
