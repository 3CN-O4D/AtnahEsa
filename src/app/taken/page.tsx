'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Home, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Listing } from '@/types'

export default function TakenHousesPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('listings')
      .select('id, title, location, taken_by_name, uploader_name, created_at')
      .eq('status', 'taken')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setListings((data ?? []) as Listing[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Home className="w-6 h-6 text-purple-600" />
        <h1 className="text-2xl font-bold">Taken Houses</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20">
          <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No taken houses yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900">{listing.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{listing.location}</p>
              <p className="text-sm text-gray-700 mt-2">
                Taken by <span className="font-medium">{listing.taken_by_name || listing.uploader_name || 'Unknown'}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
