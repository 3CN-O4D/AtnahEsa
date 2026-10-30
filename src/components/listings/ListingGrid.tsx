'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ListingCard from './ListingCard'
import { Home, Wifi, Search, Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { Listing } from '@/types'

interface ListingGridProps {
  fetchListings: (page: number) => Promise<Listing[]>
  /** Kept in the public props for callers; resets follow fetchListings identity. */
  sort?: string
  filters?: Record<string, string>
  query?: string
}

interface ListerInfo {
  full_name: string | null
  role: string | null
  verified: boolean | null
}

const INITIAL_SKELETONS = 8
const LOADING_SKELETONS = 4

function CardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-fadeIn"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative aspect-[4/3] w-full animate-shimmer">
          <div className="absolute left-2 top-2 h-5 w-16 rounded-full bg-white/60 dark:bg-white/10 animate-pulse-slow" />
          <div className="absolute bottom-2 right-2 h-5 w-20 rounded-full bg-white/60 dark:bg-white/10 animate-pulse-slow" />
        </div>
        <div className="space-y-2 p-3">
          <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3.5 w-1/2 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3.5 w-2/5 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3 w-1/4 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

export default function ListingGrid({ fetchListings }: ListingGridProps) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [listerInfo, setListerInfo] = useState<Map<string, ListerInfo>>(new Map())

  const loaderRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const fetchRef = useRef(fetchListings)

  // Pagination bookkeeping lives in refs so a re-render never triggers a
  // duplicate request, and a stale response can never advance the cursor.
  const activeRef = useRef(0) // generation guard for filter/sort changes
  const loadingRef = useRef(false)
  const nextPageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const loadedPagesRef = useRef(0)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const cacheRef = useRef<Map<number, Listing[]>>(new Map())
  const prefetchingRef = useRef<number | null>(null)

  useEffect(() => {
    fetchRef.current = fetchListings
  }, [fetchListings])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!showSuccess) return
    const timer = setTimeout(() => setShowSuccess(false), 1600)
    return () => clearTimeout(timer)
  }, [showSuccess])

  const getPage = useCallback(async (page: number, generation: number): Promise<Listing[] | null> => {
    const cached = cacheRef.current.get(page)
    if (cached) return cached
    const data = await fetchRef.current(page)
    if (generation !== activeRef.current) return null
    cacheRef.current.set(page, data)
    return data
  }, [])

  const prefetchNextPage = useCallback(() => {
    const page = nextPageRef.current
    if (!hasMoreRef.current || cacheRef.current.has(page) || prefetchingRef.current === page) return

    const generation = activeRef.current
    prefetchingRef.current = page

    const run = async () => {
      try {
        const data = await fetchRef.current(page)
        if (mountedRef.current && generation === activeRef.current) {
          cacheRef.current.set(page, data)
        }
      } catch {
        // Best-effort only; the real request surfaces the error.
      } finally {
        if (prefetchingRef.current === page) prefetchingRef.current = null
      }
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleWindow.requestIdleCallback(run, { timeout: 2500 })
    } else {
      window.setTimeout(run, 500)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return

    loadingRef.current = true
    const generation = activeRef.current
    const page = nextPageRef.current
    setLoading(true)
    setError(null)

    try {
      const data = await getPage(page, generation)
      // A newer query/filter/sort has replaced this request.
      if (data === null || !mountedRef.current || generation !== activeRef.current) return

      if (data.length === 0) {
        hasMoreRef.current = false
        setHasMore(false)
        return
      }

      const unique = data.filter((listing) => !seenIdsRef.current.has(listing.id))
      unique.forEach((listing) => seenIdsRef.current.add(listing.id))

      const isFirstPage = loadedPagesRef.current === 0
      loadedPagesRef.current += 1
      nextPageRef.current = page + 1

      // A short page means there is nothing after it.
      if (data.length < ITEMS_PER_PAGE) {
        hasMoreRef.current = false
        setHasMore(false)
      }

      if (unique.length > 0) {
        setListings((prev) => (prev.length === 0 ? unique : [...prev, ...unique]))
        if (!isFirstPage) setShowSuccess(true)
      }

      prefetchNextPage()
    } catch (err) {
      if (!mountedRef.current || generation !== activeRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load listings')
    } finally {
      if (generation === activeRef.current && mountedRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [getPage, prefetchNextPage])

  // The caller remounts this grid (via a key) whenever the search changes, so
  // there is no in-place reset race: mount state already starts at page 1.
  // Kicking the fetch off in a microtask keeps the first paint (skeletons)
  // free of a cascading synchronous state update.
  useEffect(() => {
    let cancelled = false
    const start = async () => {
      await Promise.resolve()
      if (!cancelled) void loadMore()
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [loadMore])

  useEffect(() => {
    const el = loaderRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current && !error) {
          void loadMore()
        }
      },
      { threshold: 0.05, rootMargin: '300px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, error, hasMore])

  // Batch-fetch lister profiles for all loaded listings (avoids N+1 per-card fetches)
  useEffect(() => {
    if (!mountedRef.current || listings.length === 0) return

    const uniqueIds = [...new Set(listings.map((l) => l.uploader_id).filter(Boolean))] as string[]
    if (uniqueIds.length === 0) return

    const supabase = createClient()
    supabase
      .from('profiles_public')
      .select('id, role, verified, full_name')
      .in('id', uniqueIds)
      .then(({ data }) => {
        if (!mountedRef.current) return
        const map = new Map<string, ListerInfo>()
        for (const p of data ?? []) {
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
    if (loadingRef.current) return
    setError(null)
    void loadMore()
  }

  const isInitialLoading = loading && listings.length === 0 && !error
  const isEmpty = !loading && !error && listings.length === 0 && !hasMore

  return (
    <div>
      {error && listings.length === 0 && (
        <div className="text-center py-12 space-y-4 animate-fadeIn animate-slideUp">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Failed to load listings</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">{error}</p>
          <button
            onClick={retry}
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {isInitialLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 py-4">
          {Array.from({ length: INITIAL_SKELETONS }).map((_, i) => (
            <CardSkeleton key={i} delay={(i % 4) * 0.08} />
          ))}
        </div>
      )}

      {listings.length > 0 && (
        <>
          <div className="mb-4 flex items-center gap-2 animate-fadeIn animate-slideUp">
            <span className="font-semibold text-gray-700 dark:text-gray-200" aria-live="polite">
              {listings.length} home{listings.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              &middot; {loading ? 'loading more…' : 'all loaded'}
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
                <div
                  key={listing.id}
                  className="animate-slideUp animate-fadeIn animate-elasticIn"
                  style={{ animationDelay: `${(i % 8) * 0.06}s` }}
                >
                  <ListingCard
                    listing={listing}
                    listerName={info?.full_name ?? listing.uploader_name ?? ''}
                    isAdmin={info?.role === 'admin'}
                    verified={info?.verified ?? false}
                  />
                </div>
              )
            })}

            {/* Placeholders for the batch currently in flight, inside the same
                grid so already-rendered cards stay visible and in place. */}
            {loading &&
              Array.from({ length: LOADING_SKELETONS }).map((_, i) => (
                <CardSkeleton key={`loading-${listings.length + i}`} delay={i * 0.06} />
              ))}
          </div>

          {error && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center animate-fadeIn dark:border-red-900/60 dark:bg-red-950/30">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}
        </>
      )}

      {isEmpty && (
        <div className="text-center py-12 space-y-6 animate-fadeIn animate-slideUp">
          <div className="space-y-2">
            <div className="animate-bounce-slow inline-block text-4xl mb-3">🏠</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">All Houses Are Currently Taken</h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
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
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors tap-scale hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700">
                <Wifi className="w-4 h-4" /> Browse WiFi Packages
              </span>
            </Link>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 max-w-md mx-auto text-left animate-fadeInUp dark:bg-blue-950/30 dark:border-blue-900/50">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2 mb-2">
              <Wifi className="w-4 h-4" /> While You Wait — Get Internet Ready
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300/80 leading-relaxed">
              Moving into a new home? Compare the latest WiFi packages from top providers and pick a plan.
              Packages start as low as KES 1,000/month.
            </p>
            <Link href="/wifi" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block font-medium transition-colors hover:translate-x-1">
              View packages →
            </Link>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Search className="w-3.5 h-3.5" />
            Try adjusting your search or filters, or request a house and we&apos;ll match you.
          </div>
        </div>
      )}

      {/* One persistent sentinel: it exists before the first page arrives and
          stays mounted afterwards, so the observer never loses its target. */}
      {hasMore && !error && (
        <div
          ref={loaderRef}
          className={listings.length > 0 ? 'flex justify-center py-8' : 'h-4'}
        >
          {listings.length > 0 && loading && (
            <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400 animate-fadeIn">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-sm animate-pulse-slow">Loading more homes…</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
