'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { MapPin, AlertTriangle, BadgeCheck, Heart } from 'lucide-react'
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
  const [isFavorite, setIsFavorite] = useState(false)
  const [showHeart, setShowHeart] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles_public')
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

  const isUnavailable = listing.status === 'taken' || listing.status === 'booked'

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFavorite(!isFavorite)
    setShowHeart(true)
    setTimeout(() => setShowHeart(false), 800)
  }

  return (
    <Link href={`/listings/${listing.id}`} aria-disabled={isUnavailable} className="block">
      <Card className="transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-blue-500/50" hover>
        <div className={`aspect-[4/3] relative overflow-hidden group ${isUnavailable ? 'grayscale-[0.4] brightness-90' : ''}`}>
          <Slideshow images={listing.images} interval={4000} className="w-full h-full rounded-none transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
          
          {/* Favorite button */}
          <button
            type="button"
            onClick={handleFavoriteClick}
            className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-full shadow-lg transition-all duration-200 hover:scale-110 hover:bg-white dark:hover:bg-slate-800 tap-scale"
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              className={`
                w-5 h-5 transition-all duration-300
                ${isFavorite ? 'text-red-500 fill-current' : 'text-gray-600 dark:text-gray-400'}
                ${showHeart ? 'animate-heartBeat' : ''}
              `}
              fill={isFavorite ? 'currentColor' : 'none'}
              strokeWidth={isFavorite ? 0 : 2}
            />
          </button>

          {listing.status === 'taken' && (
            <div className="absolute inset-0 bg-red-900/35 flex items-center justify-center">
              <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-shake">
                TAKEN
              </div>
            </div>
          )}
          {listing.status === 'published' && (
            <div className="absolute top-2 left-2 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-scaleIn">
              AVAILABLE
            </div>
          )}
          {listing.status === 'booked' && (
            <div className="absolute inset-0 bg-amber-900/35 flex items-center justify-center">
              <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-pulse-slow">
                BOOKED
              </div>
            </div>
          )}
          {(() => {
            const posted = new Date(listing.created_at)
            const days = (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24)
            if (days <= 7 && listing.status === 'published') {
              return (
                <div className="absolute top-2 left-2 animate-bounce-slow">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg animate-pulse-slow">
                    NEW
                  </span>
                </div>
              )
            }
            return null
          })()}
          <div className="absolute bottom-2 right-2 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded-full animate-scaleIn shadow-lg">
            {formatPrice(listing.price)}
          </div>
        </div>
        <div className="p-3 space-y-2 animate-fadeInUp">
          <h3 className={`font-semibold truncate transition-colors ${isUnavailable ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{listing.title}</h3>
          <div className="flex items-center gap-1 text-sm text-gray-500 animate-slideInRight" style={{ animationDelay: '50ms' }}>
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">{listing.location}</span>
          </div>
          {isUnavailable && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium animate-fadeInUp" style={{ animationDelay: '100ms' }}>View only — {listing.status === 'booked' ? 'booked' : 'already taken'}</p>
          )}
          <div className="flex items-center justify-between animate-slideInLeft" style={{ animationDelay: '100ms' }}>
            <span className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700">
              Rent: {formatPrice(listing.rent)}/mo
            </span>
            {listing.issues.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-amber-600 animate-wiggle" style={{ animationDelay: '150ms' }}>
                <AlertTriangle className="w-3 h-3" />
                <span>{listing.issues.length} issue{listing.issues.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 pt-1 border-t border-gray-100 animate-fadeInUp" style={{ animationDelay: '200ms' }}>
            <span>By: </span>
            <Link href={`/listers/${listing.uploader_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-blue-600 hover:underline transition-colors">
              {listerName}
            </Link>
            {verified && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVerifyTip(!showVerifyTip) }}
                className="relative tap-scale"
                title="Verified by AseHanta"
              >
                <BadgeCheck className={`w-3.5 h-3.5 transition-all duration-300 hover:scale-125 ${isAdmin ? 'text-green-500' : 'text-blue-500'}`} />
                {showVerifyTip && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap text-[10px] font-medium bg-black dark:bg-black text-white px-2 py-0.5 rounded shadow-lg border border-gray-700 z-50 animate-fadeInUp">
                    Verified by AseHanta
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
