'use client'

import Link from 'next/link'
import { MapPin, AlertTriangle } from 'lucide-react'
import Card from '@/components/ui/Card'
import Slideshow from '@/components/ui/Slideshow'
import { formatPrice } from '@/lib/utils'
import type { Listing } from '@/types'

interface ListingCardProps {
  listing: Listing
}

export default function ListingCard({ listing }: ListingCardProps) {
  return (
    <Link href={`/listings/${listing.id}`}>
      <Card hover>
        <div className="aspect-[4/3] relative">
          <Slideshow images={listing.images} interval={4000} className="w-full h-full rounded-none" />
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
        </div>
      </Card>
    </Link>
  )
}
