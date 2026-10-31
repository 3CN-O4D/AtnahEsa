'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ListingCard from './ListingCard'
import HouseLoader from '@/components/ui/HouseLoader'
import { Home, Wifi, Search, Sparkles, RefreshCw, Loader2, ArrowDown, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ITEMS_PER_PAGE } from '@/lib/constants'
import type { Listing } from '@/types'

interface ListingGridProps {
  fetchListings: (page: number) => Promise<Listing[]>
  /** Kept in the public props for callers; resets follow fetchListings identity. */
  sort?: string
  filters?: Record<string, string>
  query?: string
  /** How many homes each request returns. Defaults to ITEMS_PER_PAGE. */
  pageSize?: number
  /** Total homes available, used for the batch progress bar. */
  total?: number
  /** Show explicit "more houses" controls instead of infinite scrolling. */
  batchMode?: boolean
}

interface ListerInfo {
  full_name: string | null
  role: string | null
  verified: boolean | null
}

const INITIAL_SKELETONS = 8
const LOADING_SKELETONS = 4
const IMAGE_PRELOAD_TIMEOUT_MS = 900

/**
 * Best-effort preload of the first image on each card. The loader stays up
 * until these resolve (or the timeout fires), so cards never appear as empty
 * grey boxes right after a page swap.
 */
function preloadListingImages(listings: Listing[]): Promise<void> {
  if (typeof window === 'undefined' || listings.length === 0) return Promise.resolve()
  const urls = listings
    .map((listing) => listing.images?.[0])
    .filter((url): url is string => Boolean(url))
    .slice(0, LOADING_SKELETONS * 2)
  if (urls.length === 0) return Promise.resolve()

  const loads = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new window.Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = url
      })
  )

  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, IMAGE_PRELOAD_TIMEOUT_MS)),
  ])
}

function CardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div
      aria-hidden="true"
      className="animate-fadeIn"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="relative aspect-[4/3] w-full animate-shimmer">
          <div className="absolute left-2.5 top-2.5 h-5 w-16 rounded-full bg-white/60 dark:bg-white/10 animate-pulse-slow" />
          <div className="absolute bottom-2.5 right-2.5 h-5 w-20 rounded-full bg-white/60 dark:bg-white/10 animate-pulse-slow" />
        </div>
        <div className="space-y-2 p-3.5">
          <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3.5 w-1/2 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3.5 w-2/5 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
          <div className="h-3 w-1/4 rounded bg-gray-200 animate-pulse-slow dark:bg-slate-700" />
        </div>
      </div>
    </div>
  )
}

export default function ListingGrid({ fetchListings, pageSize = ITEMS_PER_PAGE, total, batchMode = false }: ListingGridProps) {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [revealingAll, setRevealingAll] = useState(false)
  const [listerInfo, setListerInfo] = useState<Map<string, ListerInfo>>(new Map())

  const loaderRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(false)
  const fetchRef = useRef(fetchListings)
  const revealingRef = useRef(false)

  // Pagination bookkeeping lives in refs so a re-render never triggers a
  // duplicate request, and a stale response can never advance the cursor.
  const activeRef = useRef(0) // generation guard for filter/sort changes
  const loadingRef = useRef(false)
  const nextPageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const loadedPagesRef = useRef(0)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const cacheRef = useRef<Map<number, Listing[]>>(new Map())
  const inFlightRef = useRef<Map<number, Promise<Listing[]>>>(new Map())

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

    // Reuse a request that a prefetch already started instead of firing a
    // duplicate fetch (which is what made the loader feel twice as slow).
    let request = inFlightRef.current.get(page)
    if (!request) {
      request = fetchRef.current(page)
      inFlightRef.current.set(page, request)
    }

    try {
      const data = await request
      if (generation !== activeRef.current) return null
      cacheRef.current.set(page, data)
      return data
    } finally {
      if (inFlightRef.current.get(page) === request) inFlightRef.current.delete(page)
    }
  }, [])

  /**
   * Warm the next pages while the current batch is on screen. Runs eagerly
   * (not on idle) and walks sequentially so it stops at the last real page.
   */
  const prefetchUpcomingPages = useCallback(async () => {
    const generation = activeRef.current
    let page = nextPageRef.current

    for (let i = 0; i < 2; i += 1) {
      if (!hasMoreRef.current || generation !== activeRef.current) return

      if (!cacheRef.current.has(page) && !inFlightRef.current.has(page)) {
        try {
          const data = await getPage(page, generation)
          if (!data) return
          // Warm the card images too, so the eventual batch swap is paint-ready.
          await preloadListingImages(data)
        } catch {
          // Best-effort only; the real request surfaces the error.
          return
        }
      }

      if (generation !== activeRef.current) return
      const pageData = cacheRef.current.get(page)
      if (!pageData || pageData.length < pageSize) return
      page += 1
    }
  }, [getPage, pageSize])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return

    loadingRef.current = true
    const generation = activeRef.current
    const page = nextPageRef.current
    // Show the batch loader while the next page is fetched/preloaded.
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
      if (data.length < pageSize) {
        hasMoreRef.current = false
        setHasMore(false)
      }

      if (unique.length > 0) {
        // Keep the loader up until the new cards' photos are ready so the
        // swap lands on a fully painted batch, never an empty grid.
        await preloadListingImages(unique)
        if (!mountedRef.current || generation !== activeRef.current) return
        setListings((prev) => (prev.length === 0 ? unique : [...prev, ...unique]))
        if (!isFirstPage) setShowSuccess(true)
      }

      void prefetchUpcomingPages()
    } catch (err) {
      if (!mountedRef.current || generation !== activeRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to load listings')
    } finally {
      if (generation === activeRef.current && mountedRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [getPage, prefetchUpcomingPages, pageSize])

  const revealAll = useCallback(async () => {
    if (revealingRef.current || !hasMoreRef.current) return
    revealingRef.current = true
    setRevealingAll(true)
    try {
      // Walk remaining pages in order so `nextPageRef` stays consistent.
      while (hasMoreRef.current && mountedRef.current) {
        const before = loadedPagesRef.current
        await loadMore()
        // If the load could not advance (e.g. another request was in flight),
        // stop rather than spinning.
        if (loadedPagesRef.current === before) break
      }
    } finally {
      revealingRef.current = false
      if (mountedRef.current) setRevealingAll(false)
    }
  }, [loadMore])

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
    if (batchMode) return
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
  }, [loadMore, error, hasMore, batchMode])

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

  const progressTotal = total && total > 0 ? total : listings.length + (hasMore ? pageSize : 0)
  const progressPct =
    progressTotal > 0 ? Math.min(100, Math.round((listings.length / progressTotal) * 100)) : 0
  const remaining = total && total > 0 ? Math.max(0, total - listings.length) : null
  const batchNumber = Math.max(1, Math.ceil(listings.length / pageSize))
  const batchCount = progressTotal > 0 ? Math.max(1, Math.ceil(progressTotal / pageSize)) : batchNumber
  const busy = loading || revealingAll

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
        <div className="py-4">
          <HouseLoader />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: INITIAL_SKELETONS }).map((_, i) => (
              <CardSkeleton key={i} delay={(i % 4) * 0.08} />
            ))}
          </div>
        </div>
      )}

      {listings.length > 0 && (
        <>
          <div className="mb-4 space-y-2 animate-fadeIn animate-slideUp">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-200" aria-live="polite">
                {listings.length} home{listings.length !== 1 ? 's' : ''}
                {total && total > 0 ? <span className="font-normal text-gray-400"> of {total}</span> : null}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                &middot; {revealingAll ? 'revealing all…' : loading ? 'loading more…' : hasMore ? 'more available' : 'all loaded'}
              </span>
              {batchMode && (
                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Batch {Math.min(batchNumber, batchCount)} / {batchCount}
                </span>
              )}
              {showSuccess && (
                <span className={`${batchMode ? '' : 'ml-auto'} flex items-center gap-1 text-xs text-green-600 dark:text-green-400 animate-scaleIn animate-fadeIn`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  New listings loaded!
                </span>
              )}
            </div>

            {batchMode && (
              <div className="flex items-center gap-3">
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200/80 dark:bg-slate-800">
                  <div
                    className="batch-progress-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#30B54A] via-emerald-400 to-teal-400 transition-[width] duration-700 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-[11px] font-bold tabular-nums text-[#2a9c40] dark:text-[#6fdc84]">
                  {progressPct}%
                </span>
              </div>
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

      {batchMode ? (
        listings.length > 0 && !error && (hasMore || revealingAll) && (
          <div className="mt-8 flex flex-col items-center gap-3 animate-fadeIn">
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={busy}
                className="batch-more-btn group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#30B54A] to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-600/35 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
                )}
                {loading ? 'Loading…' : `More houses${remaining !== null ? ` (${Math.min(pageSize, remaining)})` : ''}`}
              </button>
              <button
                type="button"
                onClick={() => void revealAll()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#30B54A] hover:text-[#2a9c40] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-[#30B54A] dark:hover:text-[#6fdc84]"
              >
                {revealingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {revealingAll ? 'Revealing…' : 'Reveal all'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {remaining !== null
                ? `${remaining} more home${remaining !== 1 ? 's' : ''} waiting`
                : 'More homes available'}
            </p>
          </div>
        )
      ) : (
        hasMore && !error && (
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
        )
      )}

      {batchMode && !hasMore && !loading && listings.length > 0 && !error && (
        <div className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 animate-fadeIn dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          You&apos;ve seen every available home
        </div>
      )}
    </div>
  )
}
