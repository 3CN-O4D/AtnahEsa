'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { MapPin, AlertTriangle, BadgeCheck } from 'lucide-react'
import Card from '@/components/ui/Card'
import Slideshow from '@/components/ui/Slideshow'
import { formatPrice } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Listing } from '@/types'

interface ListingCardProps {
  listing: Listing
}

export default function ListingCard({ listing }: ListingCardProps) {
  const [listerName, setListerName] = useState(listing.uploader_name || '')
  const [verified, setVerified] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showVerifyTip, setShowVerifyTip] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('role, verified, full_name')
      .eq('id', listing.uploader_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.role === 'admin') {
            setListerName('AseHanta')
            setVerified(true)
            setIsAdmin(true)
          } else {
            setListerName(data.full_name || listing.uploader_name || '')
            setVerified(!!data.verified)
            setIsAdmin(false)
          }
        }
      })
  }, [listing.uploader_id, listing.uploader_name])

  return (
    <Link href={`/listings/${listing.id}`}>
      <Card hover>
        <div className="aspect-[4/3] relative">
          <Slideshow images={listing.images} interval={4000} className="w-full h-full rounded-none" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
          <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded-full">
            {formatPrice(listing.price)}
          </div>
        </div>
        <div className="p-3 space-y-2">
          <h3 className="font-semibold text-gray-900 truncate">{listing.title}</h3>
          <div className="flex items-center gap-1 text-sm text-gray-500">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{listing.location}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-600">
              Rent: {formatPrice(listing.rent)}/mo
            </span>
            {listing.issues.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                <span>{listing.issues.length} issue{listing.issues.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1 border-t border-gray-100">
            <span>By: </span>
            <Link href={`/listers/${listing.uploader_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-blue-600 hover:underline">
              {listerName}
            </Link>
            {verified && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVerifyTip(!showVerifyTip) }}
                className="relative"
                title={isAdmin ? 'Verified by AseHanta' : 'Verified User'}
              >
                <BadgeCheck className={`w-3.5 h-3.5 ${isAdmin ? 'text-green-500' : 'text-blue-500'}`} />
                {showVerifyTip && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap text-[10px] font-medium bg-gray-900 text-white px-2 py-0.5 rounded shadow-lg z-10">
                    {isAdmin ? 'Verified by AseHanta' : 'Verified User'}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
