'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import ListingCard from './ListingCard'
import type { Listing } from '@/types'

interface ListingGridProps {
  fetchListings: (page: number) => Promise<Listing[]>
  sort?: string
  filters?: Record<string, string>
  query?: string
}

export default function ListingGrid({ fetchListings, sort, filters, query }: ListingGridProps) {
  const [listings, setListings] = useState<Listing[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loaderRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)

    try {
      const data = await fetchListings(page)
      if (data.length === 0) {
        setHasMore(false)
      } else {
        setListings((prev) => {
          const existing = new Set(prev.map((l) => l.id))
          const unique = data.filter((l) => !existing.has(l.id))
          return [...prev, ...unique]
        })
        setPage((p) => p + 1)
      }
    } catch {
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [page, hasMore, fetchListings])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setListings([])
    setPage(1)
    setHasMore(true)
    loadingRef.current = false
  }, [sort, filters, query])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (page === 1 && hasMore) {
      loadMore()
    }
  }, [page, hasMore, loadMore])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const el = loaderRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
      {!hasMore && listings.length === 0 && (
        <p className="text-center text-gray-500 py-12">No listings found.</p>
      )}
      {hasMore && (
        <div ref={loaderRef} className="flex justify-center py-8">
          {loading && (
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
          )}
        </div>
      )}
    </div>
  )
}