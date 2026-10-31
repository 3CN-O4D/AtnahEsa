'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, AlertTriangle, BadgeCheck, Heart } from 'lucide-react'
import Card from '@/components/ui/Card'
import Slideshow from '@/components/ui/Slideshow'
import { formatPrice } from '@/lib/utils'
import { useFavorites } from '@/lib/favorites'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import { seedDetailCache, prefetchListingDetail } from '@/lib/listing-detail-cache'
import type { Listing } from '@/types'

interface ListingCardProps {
  listing: Listing
  listerName?: string
  isAdmin?: boolean
  verified?: boolean
}

// Snapshot taken when the card module loads. Keeps the "new listing" check out
// of the render path (reading the clock during render is impure).
const PAGE_LOADED_AT = Date.now()
const NEW_LISTING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export default function ListingCard({ listing, listerName, isAdmin, verified }: ListingCardProps) {
  const router = useRouter()
  const { isFavorite, toggle } = useFavorites()
  const [showVerifyTip, setShowVerifyTip] = useState(false)
  const [showHeart, setShowHeart] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leaveTimer = useRef<number | null>(null)

  // Playful touch: the card lifts on hover, then shakes itself off as the
  // pointer leaves, like dust falling off. The animation lives on the outer
  // wrapper so it never fights the card's hover transform.
  const handleMouseLeave = () => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current)
    setLeaving(false)
    requestAnimationFrame(() => {
      setLeaving(true)
      leaveTimer.current = window.setTimeout(() => setLeaving(false), 620)
    })
  }

  const isUnavailable = listing.status === 'taken' || listing.status === 'booked'
  const saved = isFavorite(listing.id)

  /**
   * Warm the preview before the click lands: seed it synchronously from this
   * card so the detail page paints instantly, then fetch the full row (videos
   * included) in the background.
   */
  const warmPreview = () => {
    if (isUnavailable) return
    seedDetailCache(listing)
    void prefetchListingDetail(listing.id)
  }

  const posted = new Date(listing.created_at)
  const isNew = listing.status === 'published' && PAGE_LOADED_AT - posted.getTime() <= NEW_LISTING_WINDOW_MS

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setShowHeart(true)
    setTimeout(() => setShowHeart(false), 800)
    void toggle(listing.id).then((result) => {
      // Guard rail: if a future account-only rule applies, send them to sign in
      // and bring them back to this exact card.
      if (result === 'auth') router.push(signInUrl(currentPathWithSearch()))
    })
  }

  return (
    <div className={`relative ${leaving ? 'card-shake' : ''}`}>
      <Card
        onMouseLeave={handleMouseLeave}
        className="group/card relative rounded-2xl border-gray-200/80 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#30B54A]/40 hover:shadow-2xl hover:shadow-slate-900/10 dark:border-slate-800"
      >
        <div className={`aspect-[4/3] relative overflow-hidden group ${isUnavailable ? 'grayscale-[0.4] brightness-90' : ''}`}>
          <Slideshow images={listing.images} interval={4000} className="w-full h-full rounded-none transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/5 opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
          
          {/* Favorite button */}
          <button
            type="button"
            onClick={handleFavoriteClick}
            className="absolute top-2.5 right-2.5 z-10 rounded-full bg-white/90 p-2 shadow-lg backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:bg-white dark:bg-slate-900/85 dark:hover:bg-slate-800 tap-scale"
            aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
            aria-pressed={saved}
            title={saved ? 'Saved to favourites' : 'Save to favourites'}
          >
            <Heart
              className={`
                w-[18px] h-[18px] transition-all duration-300
                ${saved ? 'text-red-500 fill-current' : 'text-gray-600 dark:text-gray-300'}
                ${showHeart ? 'animate-heartBeat' : ''}
              `}
              fill={saved ? 'currentColor' : 'none'}
              strokeWidth={saved ? 0 : 2}
            />
          </button>

          {listing.status === 'taken' && (
            <div className="absolute inset-0 bg-red-950/40 backdrop-blur-[1px] flex items-center justify-center">
              <div className="absolute top-2.5 left-2.5 bg-red-600/95 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-1 ring-white/30">
                Taken
              </div>
            </div>
          )}
          {listing.status === 'published' && (
            <div className={`absolute top-2.5 left-2.5 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-1 ring-white/30 ${isNew ? 'bg-blue-600/95' : 'bg-[#30B54A]/95'}`}>
              {isNew ? 'New' : 'Available'}
            </div>
          )}
          {listing.status === 'booked' && (
            <div className="absolute inset-0 bg-amber-950/35 backdrop-blur-[1px] flex items-center justify-center">
              <div className="absolute top-2.5 left-2.5 bg-amber-500/95 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-1 ring-white/30">
                Booked
              </div>
            </div>
          )}
          <div className="absolute bottom-2.5 right-2.5 rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md ring-1 ring-white/20">
            {formatPrice(listing.price)}
          </div>
        </div>
        <div className="space-y-2 p-3.5">
          <h3 className={`truncate text-[15px] font-semibold transition-colors ${isUnavailable ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 group-hover/card:text-[#2a9c40] dark:text-white dark:group-hover/card:text-[#6fdc84]'}`}>{listing.title}</h3>
          <div className="flex items-center gap-1 text-[13px] text-gray-500 dark:text-gray-400">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{listing.location}</span>
          </div>
          {isUnavailable && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">View only — {listing.status === 'booked' ? 'booked' : 'already taken'}</p>
          )}
          <div className="flex items-end justify-between gap-2 pt-0.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Rent</p>
              <p className="text-[15px] font-bold text-gray-900 dark:text-white">
                {formatPrice(listing.rent)}<span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">/mo</span>
              </p>
            </div>
            {listing.issues.length > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                <span>{listing.issues.length} issue{listing.issues.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-slate-800 dark:text-gray-400">
            <span>By</span>
            <Link href={`/listers/${listing.uploader_id}`} className="relative z-10 truncate font-semibold text-blue-600 transition-colors hover:underline dark:text-blue-400">
              {listerName || 'AseHanta lister'}
            </Link>
            {verified && (
              <button
                type="button"
                onClick={() => setShowVerifyTip(!showVerifyTip)}
                className="relative z-10 tap-scale"
                title="Verified by AseHanta"
              >
                <BadgeCheck className={`w-3.5 h-3.5 transition-all duration-300 hover:scale-125 ${isAdmin ? 'text-green-500' : 'text-blue-500'}`} />
                {showVerifyTip && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap text-[10px] font-medium bg-black text-white px-2 py-0.5 rounded shadow-lg border border-gray-700 z-50 animate-fadeInUp">
                    Verified by AseHanta
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
        {/* Full-card link overlay. Kept as a sibling of the content so the
            lister link and favourite button remain valid, non-nested anchors. */}
        <Link
          href={`/listings/${listing.id}`}
          aria-disabled={isUnavailable}
          aria-label={`View ${listing.title}`}
          onPointerEnter={warmPreview}
          onFocus={warmPreview}
          onTouchStart={warmPreview}
          className="absolute inset-0 z-[5] rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#30B54A]"
        />
      </Card>
    </div>
  )
}
