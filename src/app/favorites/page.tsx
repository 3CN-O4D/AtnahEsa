'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, Search, ShieldCheck, Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button'
import ListingCard from '@/components/listings/ListingCard'
import { SkeletonList } from '@/components/ui/Skeleton'
import { useFavorites } from '@/lib/favorites'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import type { Listing } from '@/types'

type ListerInfo = { full_name: string | null; role: string | null; verified: boolean }

export default function FavoritesPage() {
  const { ids, ready, signedIn } = useFavorites()
  const [listings, setListings] = useState<Listing[]>([])
  const [listers, setListers] = useState<Record<string, ListerInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return

    if (!signedIn) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch('/api/favorites?include=listings', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load your favourites')
        return (await res.json()) as {
          listings?: Listing[]
          listers?: Record<string, ListerInfo>
        }
      })
      .then((data) => {
        if (cancelled) return
        setListings(data.listings || [])
        setListers(data.listers || {})
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your favourites')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [ready, signedIn])

  // Hearts are optimistic, so filter against the live id set to make a removed
  // card disappear the moment its heart is tapped.
  const visible = listings.filter((listing) => ids.has(listing.id))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-red-500">
            <Heart className="h-4 w-4 fill-current" /> Saved homes
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">My Favourites</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {signedIn && !loading && visible.length > 0
              ? `${visible.length} saved house${visible.length !== 1 ? 's' : ''}. Tap a heart to remove it.`
              : 'Keep the houses you love in one place and come back to them any time.'}
          </p>
        </div>
        {signedIn && visible.length > 0 && (
          <Link href="/">
            <Button variant="outline" size="sm">
              <Search className="mr-1.5 h-4 w-4" /> Browse more houses
            </Button>
          </Link>
        )}
      </div>

      {!ready || (loading && signedIn) ? (
        <SkeletonList />
      ) : !signedIn ? (
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 text-center dark:border-blue-900/50 dark:from-blue-950/40 dark:to-indigo-950/40">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900">
            <Heart className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Sign in to see your favourites</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-300">
            Saved houses are tied to your account so they follow you across devices. Sign in and every heart
            you have tapped will be waiting here.
          </p>
          <Link href={signInUrl(currentPathWithSearch())} className="mt-5 inline-block">
            <Button>
              <Heart className="mr-1.5 h-4 w-4" /> Sign in to view favourites
            </Button>
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/60 dark:bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">Could not load favourites</h2>
          <p className="mt-1 text-sm text-red-700 dark:text-red-300/80">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
            <Heart className="h-7 w-7 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">No favourites yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Tap the heart on any house card to save it here. You can compare them later without losing your
            place.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/">
              <Button>
                <Search className="mr-1.5 h-4 w-4" /> Find a house
              </Button>
            </Link>
            <Link href="/request-house">
              <Button variant="outline">
                <Sparkles className="mr-1.5 h-4 w-4" /> Request a house
              </Button>
            </Link>
          </div>
          <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Saved homes stay private to your account.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((listing) => {
            const info = listers[listing.uploader_id]
            return (
              <ListingCard
                key={listing.id}
                listing={listing}
                listerName={info?.full_name ?? listing.uploader_name ?? ''}
                isAdmin={info?.role === 'admin'}
                verified={info?.verified ?? false}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
