'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, Home, Key } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Listing, Profile } from '@/types'
import { SkeletonLister } from '@/components/ui/Skeleton'

export default function ListerPage() {
  const params = useParams()
  const id = params.id as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [taken, setTaken] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    const supabase = createClient()

    Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('listings').select('*').eq('uploader_id', id).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('listings').select('*').eq('uploader_id', id).eq('status', 'taken').order('created_at', { ascending: false }),
    ]).then(([profileRes, listingsRes, takenRes]) => {
      if (profileRes.data) setProfile(profileRes.data as Profile)
      setListings((listingsRes.data ?? []) as Listing[])
      setTaken((takenRes.data ?? []) as Listing[])
      setLoading(false)
    })
  }, [id])

  if (loading) return <SkeletonLister />
  if (!profile) return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-500">Lister not found.</div>

  const displayName = profile.role === 'admin' ? 'AseHanta' : profile.full_name

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold dark:text-white">{displayName}</h1>
              {profile.role === 'admin' && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-green-500" /></span>}
              {profile.role !== 'admin' && profile.verified && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-blue-500" /></span>}
            </div>
            <p className="text-sm text-gray-500 capitalize">{profile.role}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3 dark:text-white">
            <Home className="w-5 h-5 text-green-600" /> Active Listings ({listings.length})
          </h2>
          {listings.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No active listings.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {listings.map((l) => (
                <Link key={l.id} href={`/listings/${l.id}`} className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <h3 className="font-semibold truncate dark:text-white">{l.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{l.location}</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-1">Rent: {formatPrice(l.rent)}/mo</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3 dark:text-white">
            <Key className="w-5 h-5 text-red-600" /> Taken Houses ({taken.length})
          </h2>
          {taken.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No taken houses.</p>
          ) : (
            <div className="space-y-2">
              {taken.map((l) => (
                <div key={l.id} className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl p-4">
                  <h3 className="font-semibold dark:text-white">{l.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{l.location}</p>
                  {l.taken_by_name && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Taken by: {l.taken_by_name}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
