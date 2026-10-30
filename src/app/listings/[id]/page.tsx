'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapPin, AlertTriangle, Video, ArrowLeft, Calendar, Home, Info, Star, User, Flag, Phone as PhoneIcon, BadgeCheck, ExternalLink, MessageCircle, Heart, ShieldCheck } from 'lucide-react'
import Slideshow from '@/components/ui/Slideshow'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { useFavorites } from '@/lib/favorites'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import { formatPrice } from '@/lib/utils'
import { APP_NAME, WHATSAPP_NUMBER } from '@/lib/constants'
import { getWhatsAppLink } from '@/lib/whatsapp'
import ListingCard from '@/components/listings/ListingCard'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import type { Listing, Review, Profile, ListerReview } from '@/types'

const ImageViewer = dynamic(() => import('@/components/ui/ImageViewer'), { ssr: false })
const ReportModal = dynamic(() => import('@/components/reports/ReportModal'), { ssr: false })

const LISTING_SUPPORT_LINK = getWhatsAppLink(
  WHATSAPP_NUMBER,
  `Hi ${APP_NAME}, I need help with a house listing on the website.`
)

function videoSrc(url: string): string {
  if (url.startsWith('https://') && url.includes('/storage/v1/s3/')) {
    const parts = url.split('/storage/v1/s3/')
    if (parts[1]) return `/api/video?key=${encodeURIComponent(parts[1].replace(/^[^/]+\//, ''))}`
  }
  return url
}

function Stars({ rating, interactive, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type={interactive ? 'button' : undefined}
          onClick={() => interactive && onChange?.(star)}
          className={`text-lg ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform ${star <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-500'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [lister, setLister] = useState<(Profile & { listing_count: number }) | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [reviewProfiles, setReviewProfiles] = useState<Record<string, Profile>>({})
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showViewer, setShowViewer] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [myAnonymous, setMyAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [canReview, setCanReview] = useState(false)
  const [phoneUnlocked, setPhoneUnlocked] = useState(false)
  const [listerContact, setListerContact] = useState<{ name?: string; phone: string | null; whatsapp: string | null } | null>(null)
  const [similar, setSimilar] = useState<Listing[]>([])
  const [listerReviews, setListerReviews] = useState<ListerReview[]>([])
  const [listerReviewProfiles, setListerReviewProfiles] = useState<Record<string, Profile>>({})
  const [listerRating, setListerRating] = useState(0)
  const [listerComment, setListerComment] = useState('')
  const [listerAnonymous, setListerAnonymous] = useState(false)
  const [submittingLister, setSubmittingLister] = useState(false)
  const [listerModalOpen, setListerModalOpen] = useState(false)
  const [heartPulse, setHeartPulse] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { isFavorite, toggle } = useFavorites()

  const saved = isFavorite(id)

  const handleToggleFavorite = () => {
    setHeartPulse(true)
    setTimeout(() => setHeartPulse(false), 800)
    void toggle(id).then((result) => {
      if (result === 'auth') router.push(signInUrl(currentPathWithSearch()))
    })
  }

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      supabase.auth.getUser(),
      // C-C: Never expose lister_phone to the public. Select only safe columns.
      // Lister contact is revealed only after payment via /api/bookings/[id]/pdf
      // and the tuma-status endpoint (which checks payment status).
      supabase
        .from('listings')
        .select(
          'id,title,description,price,rent,location,images,youtube_url,tiktok_url,video_url,video_urls,youtube_urls,tiktok_urls,issues,issues_count,deposit,deposit_refundable,electricity,electric_bill,water,why_vacant,vacancy,vacancy_type,house_type,building_type,floor_number,descriptive_location,payment_method,status,taken_at,taken_by_name,uploader_id,uploader_name,created_at,updated_at'
        )
        .eq('id', id)
        .single(),
    ]).then(async ([userRes, listingRes]) => {
      const currentUser = userRes.data.user
      setUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null)

      if (listingRes.error || !listingRes.data) { router.push('/'); return }
      const l = listingRes.data as Listing
      setListing(l)

      const [profileRes, countRes, revsRes, lrRes, simRes, bookingCountRes, paidHouseCountRes] = await Promise.all([
        supabase.from('profiles_public').select('*').eq('id', l.uploader_id).single(),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('uploader_id', l.uploader_id),
        supabase.from('reviews').select('*').eq('listing_id', id).order('created_at', { ascending: false }),
        l.uploader_id ? supabase.from('lister_reviews').select('*').eq('lister_id', l.uploader_id).order('created_at', { ascending: false }) : Promise.resolve({ data: null }),
        supabase.from('listings').select('*').eq('status', 'published').eq('location', l.location).neq('id', id).limit(10),
        currentUser ? supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('listing_id', id).eq('user_id', currentUser.id).eq('release_status', 'released') : Promise.resolve({ count: null }),
        currentUser ? supabase.from('house_bookings').select('*', { count: 'exact', head: true }).eq('listing_id', id).eq('user_id', currentUser.id).in('release_status', ['held', 'paid', 'refunded']) : Promise.resolve({ count: null }),
      ])

      if (profileRes.data) setLister({ ...profileRes.data as Profile, listing_count: countRes.count ?? 0 })

      const revs = (revsRes.data ?? []) as Review[]
      setReviews(revs)

      const lr = (lrRes.data ?? []) as ListerReview[]
      setListerReviews(lr)

      setSimilar((simRes.data ?? []) as Listing[])

      if (currentUser) {
        const hasPaidBooking = ((bookingCountRes?.count ?? 0) > 0) || ((paidHouseCountRes?.count ?? 0) > 0)
        setCanReview(hasPaidBooking)
        setPhoneUnlocked(hasPaidBooking)
      }

      const userIds = [...new Set(revs.map((r) => r.user_id))]
      const lrUserIds = [...new Set(lr.map((r) => r.reviewer_id))]
      const allProfileIds = [...new Set([...userIds, ...lrUserIds])]
      if (allProfileIds.length > 0) {
        const { data: allProfiles } = await supabase.from('profiles_public').select('*').in('id', allProfileIds)
        const pmap: Record<string, Profile> = {}
        for (const p of allProfiles ?? []) pmap[p.id] = p as Profile
        setReviewProfiles(pmap)
        setListerReviewProfiles(pmap)
      }

      setLoading(false)
    })
  }, [id, router])

  // Unlock the lister's real number only once the server confirms a paid booking.
  useEffect(() => {
    if (!phoneUnlocked) return
    let cancelled = false
    fetch(`/api/listings/${id}/contact`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setListerContact(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [phoneUnlocked, id])

  const handleSubmitReview = async () => {
    if (!user || !listing || myRating === 0) return
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('reviews').insert({
      listing_id: listing.id,
      user_id: user.id,
      rating: myRating,
      comment: myComment,
      is_anonymous: myAnonymous,
    })
    if (!error) {
      setReviews([{ id: '', listing_id: listing.id, user_id: user.id, rating: myRating, comment: myComment, is_anonymous: myAnonymous, created_at: new Date().toISOString() }, ...reviews])
      setMyRating(0); setMyComment(''); setMyAnonymous(false)
    }
    setSubmitting(false)
  }

  const handleSubmitListerReview = async () => {
    if (!user || !listing || listerRating === 0) return
    setSubmittingLister(true)
    const supabase = createClient()
    const { error } = await supabase.from('lister_reviews').insert({
      lister_id: listing.uploader_id,
      reviewer_id: user.id,
      booking_id: null,
      rating: listerRating,
      comment: listerComment,
      is_anonymous: listerAnonymous,
    })
    if (!error) {
      setListerReviews([{ id: '', lister_id: listing.uploader_id, reviewer_id: user.id, booking_id: null, rating: listerRating, comment: listerComment, is_anonymous: listerAnonymous, created_at: new Date().toISOString() }, ...listerReviews])
      setListerRating(0); setListerComment(''); setListerAnonymous(false)
    }
    setSubmittingLister(false)
  }

  const alreadyReviewed = user && reviews.some((r) => r.user_id === user.id)

  if (loading) {
    return <SkeletonDetail />
  }

  if (!listing) return null

  const videos = [
    ...((listing.video_urls?.length ? listing.video_urls : (listing.video_url ? [listing.video_url] : [])).map((u: string) => ({ type: 'direct' as const, url: u, id: '' }))),
    ...((listing.youtube_urls?.length ? listing.youtube_urls : (listing.youtube_url ? [listing.youtube_url] : [])).map((u: string) => {
      const m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
      return { type: 'youtube' as const, url: u, id: m?.[1] || '' }
    }).filter((v) => v.id)),
    ...((listing.tiktok_urls?.length ? listing.tiktok_urls : (listing.tiktok_url ? [listing.tiktok_url] : [])).map((u: string) => {
      const m = u.match(/tiktok\.com\/(?:@[^/]+\/(?:video|photo)\/|embed\/(?:v2\/)?|v\/)(\d+)/)
      return { type: 'tiktok' as const, url: u, id: m?.[1] || '' }
    }).filter((v) => v.id)),
  ]

  const avgRating = reviews.length > 0 ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10 : 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="relative mb-6 overflow-hidden rounded-2xl shadow-xl shadow-slate-900/10 ring-1 ring-black/5 dark:ring-white/10">
        <Slideshow
          images={listing.images}
          className="w-full aspect-[4/3] sm:aspect-video"
          onImageClick={(i) => { setViewerIndex(i); setShowViewer(true) }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/5" />
        {showViewer && <ImageViewer images={listing.images} initialIndex={viewerIndex} onClose={() => setShowViewer(false)} />}

        {/* Save control stays on the hero so it is available without scrolling. */}
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
          title={saved ? 'Saved to favourites' : 'Save to favourites'}
          className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-gray-700 shadow-lg backdrop-blur transition-all hover:scale-105 hover:bg-white dark:bg-slate-900/90 dark:text-gray-100 dark:hover:bg-slate-800"
        >
          <Heart
            className={`h-4 w-4 transition-colors ${saved ? 'fill-current text-red-500' : ''} ${heartPulse ? 'animate-heartBeat' : ''}`}
          />
          <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
        </button>

        {listing.status === 'booked' && (
          <div className="absolute left-3 top-3 rounded-full bg-amber-500/95 px-3 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-white/30">Booked</div>
        )}
        {listing.status === 'taken' && (
          <div className="absolute left-3 top-3 rounded-full bg-red-600/95 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-lg ring-1 ring-white/30">Taken</div>
        )}
        {listing.status === 'published' && (
          <div className="absolute left-3 top-3 rounded-full bg-[#30B54A]/95 px-3 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-white/30">Available</div>
        )}

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-900 shadow-lg backdrop-blur dark:bg-slate-900/90 dark:text-white">
            {formatPrice(listing.price)} booking fee
          </span>
          <span className="flex items-center gap-1 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur">
            <MapPin className="h-3 w-3" /> {listing.location}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {listing.house_type && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{listing.house_type}</span>}
              {listing.building_type && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-slate-800 dark:text-gray-300">{listing.building_type === 'storey' ? `Storey${listing.floor_number ? ` - ${listing.floor_number}` : ''}` : 'Flat'}</span>}
              {listing.vacancy && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${listing.vacancy === 'available' || listing.vacancy === 'vacant' ? 'bg-[#e8f8eb] text-[#238c39] dark:bg-green-950/40 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>{listing.vacancy === 'available' || listing.vacancy === 'vacant' ? 'Available' : 'Pending'}</span>}
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">{listing.title}</h1>
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <MapPin className="h-4 w-4" /> <span>{listing.location}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-center dark:border-blue-900/50 dark:bg-blue-950/30">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-300">Rent</p>
              <p className="text-lg font-bold text-blue-800 dark:text-blue-100">{formatPrice(listing.rent)}</p>
              <p className="text-xs text-blue-500 dark:text-blue-300">/month</p>
            </div>
            {listing.deposit > 0 && (
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-center dark:border-purple-900/50 dark:bg-purple-950/30">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-300">Deposit</p>
                <p className="text-lg font-bold text-purple-800 dark:text-purple-100">{formatPrice(listing.deposit)}</p>
                <p className="text-xs text-purple-500 dark:text-purple-300">{listing.deposit_refundable ? 'Refundable' : 'Non-refundable'}</p>
              </div>
            )}
            {listing.electric_bill && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-center dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-300">Electricity</p>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-100">{listing.electric_bill}</p>
              </div>
            )}
            {listing.water && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-center dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-300">Water</p>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-100">{listing.water}</p>
              </div>
            )}
          </div>

          {listing.vacancy_type && (
            <div className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-gray-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span><strong>Vacancy:</strong> {listing.vacancy_type}{listing.why_vacant ? ` — ${listing.why_vacant}` : ''}</span>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{listing.description}</p>
          </div>

          {listing.descriptive_location && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Location Details</h2>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{listing.descriptive_location}</p>
            </div>
          )}

          {listing.issues.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> House Issues</h2>
              <ul className="space-y-1.5">
                {listing.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" /> {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(videos.length > 0) && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Video className="w-5 h-5 text-red-500" /> Video Tours
                  <span className="text-xs font-normal text-gray-400">({videos.length})</span>
                </h2>
                <p className="text-xs text-gray-400">Tap a video to play. Use fullscreen for the best view.</p>
              </div>
              <div className={`grid gap-5 ${videos.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {videos.map((v, i) => {
                  const isTikTok = v.type === 'tiktok'
                  const label = isTikTok ? 'TikTok tour' : v.type === 'youtube' ? 'YouTube tour' : 'Video tour'
                  return (
                    <div key={i} className={isTikTok ? 'mx-auto w-full max-w-[380px]' : 'w-full'}>
                      <div className={`relative overflow-hidden rounded-2xl bg-black shadow-xl ring-1 ring-black/10 dark:ring-white/10 ${isTikTok ? 'aspect-[9/16]' : 'aspect-video'}`}>
                        {v.type === 'direct' ? (
                          <video controls preload="metadata" className="w-full h-full object-contain" playsInline>
                            <source src={videoSrc(v.url)} />
                          </video>
                        ) : isTikTok ? (
                          <iframe
                            src={`https://www.tiktok.com/embed/v2/${v.id}?lang=en`}
                            title={`TikTok video ${i + 1}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        ) : (
                          <iframe
                            src={`https://www.youtube.com/embed/${v.id}?rel=0`}
                            title={`YouTube video ${i + 1}`}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          isTikTok
                            ? 'bg-gray-900 text-white dark:bg-white/10 dark:text-gray-200'
                            : v.type === 'youtube'
                              ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}>
                          {isTikTok ? '♪' : v.type === 'youtube' ? '▶' : '●'} {label}
                        </span>
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300 transition-colors"
                        >
                          Open {isTikTok ? 'in TikTok' : v.type === 'youtube' ? 'on YouTube' : 'video'} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                Can&apos;t see a video? Open it in the app using the link below it.
              </p>
            </div>
          )}

          {/* Lister info */}
          {lister && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/60 dark:to-indigo-950/60 border border-blue-100 dark:border-blue-800/50 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-blue-800 dark:text-white"><User className="w-4 h-4" /> Listed by</h3>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0 overflow-hidden">
                  {lister.avatar_url ? (
                    <img src={lister.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    lister.full_name?.charAt(0)?.toUpperCase() || 'L'
                  )}
                </div>
                  <div>
                    <button onClick={() => setListerModalOpen(true)} className="font-semibold text-gray-900 dark:text-white text-lg flex items-center gap-1.5 hover:underline text-left">
                      {lister.role === 'admin' ? 'AseHanta' : `@${lister.username || lister.full_name || 'Anonymous'}`}
                      {lister.role === 'admin' && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-green-500" /></span>}
                      {lister.role !== 'admin' && lister.verified && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-blue-500 dark:text-white" /></span>}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Stars rating={lister.average_rating || 0} />
                      <span className="text-sm text-gray-600 dark:text-gray-300">({lister.total_reviews || 0} review{(lister.total_reviews || 0) !== 1 ? 's' : ''})</span>
                    </div>
                  {lister.average_rating > 0 && (
                    <p className="text-xs text-blue-600 dark:text-white font-medium mt-0.5">{lister.average_rating} out of 5</p>
                  )}
                  {lister.role === 'admin' && (
                    <p className="text-xs text-blue-500 dark:text-white font-medium mt-0.5">Official AseHanta Listing</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="bg-white/60 dark:bg-white/10 rounded-lg px-3 py-1.5">
                  <span className="font-bold text-blue-700 dark:text-white">{lister.listing_count}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-1">house{lister.listing_count !== 1 ? 's' : ''} listed</span>
                </div>
                {phoneUnlocked && listerContact?.phone ? (
                  <a
                    href={`tel:${listerContact.phone}`}
                    className="text-green-600 dark:text-green-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" /> {listerContact.phone}
                  </a>
                ) : (
                  <button
                    onClick={() => router.push(user ? `/booking/${listing.id}` : signInUrl(currentPathWithSearch()))}
                    className="text-red-600 dark:text-red-400 hover:underline font-medium flex items-center gap-1"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" /> Contact lister — pay to reveal
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Gallery — full-size images */}
          {listing.images.length > 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {listing.images.map((img, i) => (
                  <button key={i} onClick={() => { setViewerIndex(i); setShowViewer(true) }} className="group relative aspect-video overflow-hidden rounded-xl">
                    <img src={img} alt={`${listing.title} ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-150 transition-transform duration-500 ease-out" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* House Details */}
          <div className="bg-white dark:bg-slate-900 border dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2 text-gray-900 dark:text-white">
              <Home className="w-4 h-4 text-blue-500" /> House Details
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {(listing.house_type && listing.house_type !== 'Other') && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Type</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.house_type}</span>
                </>
              )}
              {listing.building_type && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Building</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right capitalize">{listing.building_type === 'storey' ? 'Storey / Upstairs' : 'Flat / Ground Floor'}</span>
                </>
              )}
              {listing.floor_number && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Floor</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.floor_number}</span>
                </>
              )}
              {listing.deposit > 0 && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Deposit</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{formatPrice(listing.deposit)}{listing.deposit_refundable === false ? ' (non-refundable)' : ' (refundable)'}</span>
                </>
              )}
              {listing.electric_bill && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Electric Bill</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.electric_bill}</span>
                </>
              )}
              {listing.water && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Water</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.water}</span>
                </>
              )}
              {listing.vacancy && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Status</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right capitalize">{listing.vacancy === 'vacant' ? 'Vacant' : 'Pending'}</span>
                </>
              )}
              {listing.why_vacant && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Reason</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.why_vacant}</span>
                </>
              )}
              {listing.descriptive_location && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Access</span>
                  <span className="font-medium text-gray-900 dark:text-white text-right">{listing.descriptive_location}</span>
                </>
              )}
            </div>
          </div>

          {/* Reviews */}
          <div className="bg-white dark:bg-slate-900 border dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2 dark:text-white">
              <Star className="w-4 h-4 text-yellow-500" /> Reviews
              {avgRating > 0 && <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({avgRating} avg)</span>}
            </h3>

            {user && canReview && !alreadyReviewed && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm font-medium dark:text-white">Rate this property</p>
                <Stars rating={myRating} interactive onChange={setMyRating} />
                <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)}
                  placeholder="Your comments (optional)..."
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
                <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={myAnonymous} onChange={(e) => setMyAnonymous(e.target.checked)} className="rounded accent-gray-600" />
                  Post anonymously
                </label>
                <Button size="sm" onClick={handleSubmitReview} loading={submitting} disabled={myRating === 0}>Submit Review</Button>
              </div>
            )}
            {user && canReview && !alreadyReviewed && lister && (
              <div className="space-y-3 p-4 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl">
                <p className="text-sm font-medium dark:text-white">Rate {lister.full_name || 'the lister'}</p>
                <Stars rating={listerRating} interactive onChange={setListerRating} />
                <textarea value={listerComment} onChange={(e) => setListerComment(e.target.value)}
                  placeholder="Share your experience with this lister (optional)..."
                  className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
                <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={listerAnonymous} onChange={(e) => setListerAnonymous(e.target.checked)} className="rounded accent-gray-600" />
                  Post anonymously
                </label>
                <Button size="sm" onClick={handleSubmitListerReview} loading={submittingLister} disabled={listerRating === 0}>Submit</Button>
              </div>
            )}
            {user && !canReview && (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">Only users who booked and released funds can review.</p>
            )}

            {reviews.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No reviews yet.</p>}
            {reviews.map((r, i) => {
              const rp = reviewProfiles[r.user_id]
              const isAnonymous = r.is_anonymous
              return (
                <div key={r.id || i} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-white shrink-0 overflow-hidden">
                      {!isAnonymous && rp?.avatar_url ? (
                        <img src={rp.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        !isAnonymous ? (rp?.full_name?.charAt(0)?.toUpperCase() || '?') : '?'
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{isAnonymous ? 'Anonymous' : (rp?.full_name || 'Anonymous')}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Stars rating={r.rating} />
                      <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-gray-600 dark:text-gray-300 ml-8">{r.comment}</p>}
                </div>
              )
            })}
            {listerReviews.length > 0 && (
              <>
                <hr className="border-gray-200 dark:border-gray-700" />
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-yellow-500" /> Lister Reviews
                </h4>
                {listerReviews.map((r, i) => {
                  const rp = listerReviewProfiles[r.reviewer_id]
                  const isAnonymous = r.is_anonymous
                  return (
                    <div key={r.id || i} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300 shrink-0 overflow-hidden">
                          {!isAnonymous && rp?.avatar_url ? (
                            <img src={rp.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            !isAnonymous ? (rp?.full_name?.charAt(0)?.toUpperCase() || '?') : '?'
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{isAnonymous ? 'Anonymous' : (rp?.full_name || 'Anonymous')}</span>
                        <div className="flex items-center gap-2 ml-auto">
                          <Stars rating={r.rating} />
                          <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {r.comment && <p className="text-sm text-gray-600 dark:text-gray-300 ml-8">{r.comment}</p>}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="sticky top-24 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Monthly rent</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatPrice(listing.rent)}</p>
              </div>
              {listing.vacancy && (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${listing.vacancy === 'available' || listing.vacancy === 'vacant' ? 'bg-[#e8f8eb] text-[#238c39] dark:bg-green-950/40 dark:text-green-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                  {listing.vacancy === 'available' || listing.vacancy === 'vacant' ? 'Available' : 'Pending'}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 dark:border-blue-900/50 dark:bg-blue-950/30">
              <div className="flex items-end justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">Hunting fee</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-100">{formatPrice(listing.price)}</p>
              </div>
              <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-300/80">Paid once to book a viewing. Held safely until you decide.</p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-200">
              <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="h-4 w-4" /> Escrow protected
              </p>
              <ul className="space-y-1">
                <li>Payment is held by {APP_NAME} for <strong>24 hours</strong>.</li>
                <li>Happy with the house? <strong>Release</strong> funds to the lister.</li>
                <li>Changed your mind? <strong>85% refund</strong> (transaction &amp; listing costs deducted).</li>
                <li>Fake listing or no-show? <strong>100% refund</strong>.</li>
              </ul>
            </div>

            {listing.status === 'taken' || listing.status === 'booked' ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center dark:border-red-900/60 dark:bg-red-950/30">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">This house is {listing.status === 'booked' ? 'booked' : 'taken'}.</p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-300/80">
                  Similar houses may be available &mdash; request one and our agents will find it for you.
                </p>
                <Link href="/request-house">
                  <Button className="mt-3 w-full">
                    <Home className="w-4 h-4 mr-1.5" /> Request a House
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <Link href={`/booking/${listing.id}`}>
                  <Button className="w-full"><Calendar className="w-4 h-4 mr-1.5" /> Book Viewing</Button>
                </Link>
                {!user && (
                  <p className="text-center text-xs text-gray-400 dark:text-gray-500">No payment needed to book right now — we&apos;ll confirm via WhatsApp.</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-pressed={saved}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors ${
                saved
                  ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
              }`}
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
              {saved ? 'Saved to favourites' : 'Save to favourites'}
            </button>

            <div className="space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-slate-800 dark:text-gray-400">
              <p><strong>Listed:</strong> {new Date(listing.created_at).toLocaleDateString()}</p>
              <p><strong>Issues reported:</strong> {listing.issues.length}</p>
              <p><strong>House type:</strong> {listing.house_type || 'N/A'}</p>
            </div>

            {LISTING_SUPPORT_LINK && (
              <a
                href={LISTING_SUPPORT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
              >
                <MessageCircle className="w-4 h-4" /> Need help booking? WhatsApp us
              </a>
            )}

            <button
              onClick={() => setShowReport(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:hover:bg-red-950/30"
            >
              <Flag className="w-4 h-4" /> Report this listing
            </button>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">By booking, you agree to {APP_NAME}&apos;s terms. 85% refund if you don&apos;t take the house.</p>
          </div>
        </div>
      </div>

      {/* Similar houses */}
      {similar.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Similar Houses in {listing.location}</h2>
          <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent -mx-4 px-4 snap-x snap-mandatory">
            {similar.map((s) => (
              <div key={s.id} className="snap-start shrink-0 w-[280px] sm:w-[300px]">
                <ListingCard listing={s} />
              </div>
            ))}
          </div>
        </div>
      )}

      {showReport && (
        <ReportModal targetType="listing" targetId={listing.id} targetTitle={listing.title} onClose={() => setShowReport(false)} />
      )}

      {lister && (
        <Modal open={listerModalOpen} onClose={() => setListerModalOpen(false)} title={`@${lister.username || lister.full_name || 'Anonymous'}`}>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-sm shrink-0 overflow-hidden">
                {lister.avatar_url ? (
                  <img src={lister.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  lister.full_name?.charAt(0)?.toUpperCase() || 'L'
                )}
              </div>
              <div>
                <p className="font-semibold text-lg text-gray-900 dark:text-white flex items-center gap-1.5">
                  {lister.role === 'admin' ? 'AseHanta' : `@${lister.username || lister.full_name || 'Anonymous'}`}
                  {lister.role === 'admin' && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-green-500" /></span>}
                  {lister.role !== 'admin' && lister.verified && <span title="Verified by AseHanta"><BadgeCheck className="w-5 h-5 text-blue-500 dark:text-white" /></span>}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Stars rating={lister.average_rating || 0} />
                  <span className="text-sm text-gray-600 dark:text-gray-300">({lister.total_reviews || 0} review{(lister.total_reviews || 0) !== 1 ? 's' : ''})</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700 dark:text-white">{lister.listing_count}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">House{lister.listing_count !== 1 ? 's' : ''} Listed</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700 dark:text-white">{lister.total_reviews || 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review{lister.total_reviews !== 1 ? 's' : ''}</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-yellow-500" /> Reviews from Customers
              </h4>
              {listerReviews.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">No reviews yet.</p>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {listerReviews.map((r, i) => {
                    const rp = listerReviewProfiles[r.reviewer_id]
                    const isAnonymous = r.is_anonymous
                    return (
                      <div key={r.id || i} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-3 last:pb-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300 shrink-0 overflow-hidden">
                            {!isAnonymous && rp?.avatar_url ? (
                              <img src={rp.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              !isAnonymous ? (rp?.full_name?.charAt(0)?.toUpperCase() || '?') : '?'
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{isAnonymous ? 'Anonymous' : (rp?.full_name || 'Anonymous')}</span>
                          <div className="flex items-center gap-2 ml-auto">
                            <Stars rating={r.rating} />
                            <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {r.comment && <p className="text-sm text-gray-600 dark:text-gray-300 ml-8">{r.comment}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
