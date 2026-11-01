'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Home, ArrowLeft, Lock, MapPin, Calendar } from 'lucide-react'
import { SkeletonPage } from '@/components/ui/Skeleton'
import type { Listing } from '@/types'

export default function TakenHousesPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Booked rows are hidden by anon RLS, so the public list comes from a
    // service-role endpoint. It never exposes hunter identity.
    fetch('/api/listings/taken', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { listings: [] }))
      .then((data) => {
        setListings((data.listings ?? []) as Listing[])
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Home className="w-6 h-6 text-red-600" />
        <h1 className="text-2xl font-bold">Taken Houses</h1>
      </div>

      {loading ? (
        <SkeletonPage />
      ) : listings.length === 0 ? (
        <div className="text-center py-20">
          <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No taken houses yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="group flex items-start gap-3.5 rounded-2xl border border-red-200/70 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-red-300 hover:shadow-lg dark:border-red-900/40 dark:bg-slate-900 dark:hover:border-red-800"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 ring-1 ring-red-200/70 dark:bg-red-950/50 dark:ring-red-900/60">
                {listing.status === 'booked' ? (
                  <Calendar className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                ) : (
                  <Lock className="h-5 w-5 text-red-500 dark:text-red-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{listing.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${listing.status === 'booked' ? 'bg-amber-500' : 'bg-red-600'}`}>
                    {listing.status === 'booked' ? 'Booked' : 'Taken'}
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="h-3 w-3 shrink-0" /> {listing.location}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                  {listing.status === 'booked'
                    ? 'Booked — a hunter has paid and the visit is being arranged.'
                    : 'This house is no longer available. Photos are removed from storage 48 hours after it is taken.'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
