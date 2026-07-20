'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, AlertTriangle, DollarSign, Video, ArrowLeft, Calendar, Zap, Droplets, Home, Info, Star, User, Building, Layers, Flag, Phone as PhoneIcon } from 'lucide-react'
import Slideshow from '@/components/ui/Slideshow'
import ImageViewer from '@/components/ui/ImageViewer'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { maskPhone } from '@/lib/utils'
import { formatPrice } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'
import ReportModal from '@/components/reports/ReportModal'
import type { Listing, Review, Profile } from '@/types'

function Stars({ rating, interactive, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type={interactive ? 'button' : undefined}
          onClick={() => interactive && onChange?.(star)}
          className={`text-lg ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
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
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showViewer, setShowViewer] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [myRating, setMyRating] = useState(0)
  const [myComment, setMyComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [canReview, setCanReview] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email } : null))

    supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) { router.push('/'); return }
        const l = data as Listing
        setListing(l)

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', l.uploader_id)
          .single()

        const { count } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('uploader_id', l.uploader_id)

        if (profile) setLister({ ...profile as Profile, listing_count: count ?? 0 })

        const { data: revs } = await supabase
          .from('reviews')
          .select('*')
          .eq('listing_id', id)
          .order('created_at', { ascending: false })
        setReviews((revs ?? []) as Review[])

        const { data: userData } = await supabase.auth.getUser()
        if (userData.user) {
          const { count: bookingCount } = await supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('listing_id', id)
            .eq('user_id', userData.user.id)
            .eq('release_status', 'released')
          setCanReview((bookingCount ?? 0) > 0)
        }

        setLoading(false)
      })
  }, [id, router])

  const handleSubmitReview = async () => {
    if (!user || !listing || myRating === 0) return
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('reviews').insert({
      listing_id: listing.id,
      user_id: user.id,
      rating: myRating,
      comment: myComment,
    })
    if (!error) {
      setReviews([{ id: '', listing_id: listing.id, user_id: user.id, rating: myRating, comment: myComment, created_at: new Date().toISOString() }, ...reviews])
      setMyRating(0)
      setMyComment('')
    }
    setSubmitting(false)
  }

  const alreadyReviewed = user && reviews.some((r) => r.user_id === user.id)

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  if (!listing) return null

  const youtubeId = listing.youtube_url
    ? listing.youtube_url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1]
    : null

  const avgRating = reviews.length > 0 ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length * 10) / 10 : 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="relative">
        <Slideshow images={listing.images} className="w-full aspect-video mb-6" onImageClick={(i) => { setViewerIndex(i); setShowViewer(true) }} />
        {showViewer && <ImageViewer images={listing.images} initialIndex={viewerIndex} onClose={() => setShowViewer(false)} />}
        {listing.status === 'booked' && <div className="absolute top-4 right-4 bg-amber-500 text-white text-sm font-medium px-3 py-1 rounded-full">Booked</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {listing.house_type && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{listing.house_type}</span>}
              {listing.building_type && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{listing.building_type === 'storey' ? `Storey${listing.floor_number ? ` - ${listing.floor_number}` : ''}` : 'Flat'}</span>}
              {listing.vacancy && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${listing.vacancy === 'available' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{listing.vacancy === 'available' ? 'Available' : 'Pending'}</span>}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
            <div className="flex items-center gap-1 text-gray-500">
              <MapPin className="w-4 h-4" /> <span>{listing.location}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-600 font-medium">Rent</p>
              <p className="text-lg font-bold text-blue-700">{formatPrice(listing.rent)}</p>
              <p className="text-xs text-blue-500">/month</p>
            </div>
            {listing.deposit > 0 && (
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-xs text-purple-600 font-medium">Deposit</p>
                <p className="text-lg font-bold text-purple-700">{formatPrice(listing.deposit)}</p>
                <p className="text-xs text-purple-500">{listing.deposit_refundable ? 'Refundable' : 'Non-Refundable'}</p>
              </div>
            )}
            {listing.electric_bill && (
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xs text-amber-600 font-medium">Electricity</p>
                <p className="text-sm font-semibold text-amber-700">{listing.electric_bill}</p>
              </div>
            )}
            {listing.water && (
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Water</p>
                <p className="text-sm font-semibold text-emerald-700">{listing.water}</p>
              </div>
            )}
          </div>

          {listing.vacancy_type && (
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span><strong>Vacancy:</strong> {listing.vacancy_type}{listing.why_vacant ? ` — ${listing.why_vacant}` : ''}</span>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-gray-600 whitespace-pre-wrap">{listing.description}</p>
          </div>

          {listing.descriptive_location && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Location Details</h2>
              <p className="text-gray-600 whitespace-pre-wrap">{listing.descriptive_location}</p>
            </div>
          )}

          {listing.issues.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> House Issues</h2>
              <ul className="space-y-1.5">
                {listing.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" /> {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(listing.video_url || youtubeId) && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Video className="w-5 h-5 text-red-500" /> Video Tour</h2>
              <div className="aspect-video rounded-xl overflow-hidden">
                {listing.video_url ? (
                  <video src={listing.video_url} controls className="w-full h-full" />
                ) : (
                  <iframe src={`https://www.youtube.com/embed/${youtubeId}`} title="House Video Tour"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
                )}
              </div>
            </div>
          )}

          {/* Lister info */}
          {lister && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-blue-800"><User className="w-4 h-4" /> Listed by</h3>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0">
                  {lister.full_name?.charAt(0)?.toUpperCase() || 'L'}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{lister.full_name || 'Anonymous'}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Stars rating={lister.average_rating || 0} />
                    <span className="text-sm text-gray-500">({lister.total_reviews || 0} review{(lister.total_reviews || 0) !== 1 ? 's' : ''})</span>
                  </div>
                  {lister.average_rating > 0 && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">{lister.average_rating} out of 5</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="bg-white/60 rounded-lg px-3 py-1.5">
                  <span className="font-bold text-blue-700">{lister.listing_count}</span>
                  <span className="text-gray-500 ml-1">house{lister.listing_count !== 1 ? 's' : ''} listed</span>
                </div>
                {lister.phone && (
                  <a href={`tel:${lister.phone}`} className="text-blue-600 hover:underline font-medium flex items-center gap-1">
                    <PhoneIcon className="w-3.5 h-3.5" /> {maskPhone(lister.phone)}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="bg-white border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" /> Reviews
              {avgRating > 0 && <span className="text-sm font-normal text-gray-500">({avgRating} avg)</span>}
            </h3>

            {user && canReview && !alreadyReviewed && (
              <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
                <p className="text-sm font-medium">Rate this property</p>
                <Stars rating={myRating} interactive onChange={setMyRating} />
                <textarea value={myComment} onChange={(e) => setMyComment(e.target.value)}
                  placeholder="Your comments (optional)..."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2} />
                <Button size="sm" onClick={handleSubmitReview} loading={submitting} disabled={myRating === 0}>Submit Review</Button>
              </div>
            )}
            {user && !canReview && (
              <p className="text-xs text-gray-400 italic">Only users who booked and released funds can review this property.</p>
            )}

            {reviews.length === 0 && <p className="text-sm text-gray-400">No reviews yet.</p>}
            {reviews.map((r, i) => (
              <div key={r.id || i} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-4 space-y-4 sticky top-24">
            <div>
              <p className="text-sm text-gray-500">Monthly Rent</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(listing.rent)}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Hunting Fee</p>
              <p className="text-xl font-semibold text-blue-600">{formatPrice(listing.price)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Paid once to book a viewing</p>
            </div>

            <hr />

            {/* Terms & Escrow */}
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-800 space-y-1.5">
              <p className="font-semibold">🔒 Escrow Protected</p>
              <p>Your payment is held securely by {APP_NAME} for <strong>24 hours</strong>.</p>
              <p>✅ Like the house? <strong>Release</strong> funds to the lister.</p>
              <p>❌ Not satisfied? Get <strong>85% refund</strong> (transaction & listing costs deducted).</p>
              <p>🚨 Fake listing or no-show? <strong>100% refund</strong>.</p>
            </div>

            <hr />

            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Listed:</strong> {new Date(listing.created_at).toLocaleDateString()}</p>
              <p><strong>Issues reported:</strong> {listing.issues.length}</p>
              <p><strong>House type:</strong> {listing.house_type || 'N/A'}</p>
            </div>

            {user ? (
              <Link href={`/booking/${listing.id}`}>
                <Button className="w-full"><Calendar className="w-4 h-4 mr-1.5" /> Book Viewing</Button>
              </Link>
            ) : (
              <div className="space-y-2">
                <Link href="/auth/signin">
                  <Button className="w-full"><Calendar className="w-4 h-4 mr-1.5" /> Sign in to Book</Button>
                </Link>
                <p className="text-xs text-gray-400 text-center">Don&apos;t have an account? <Link href="/auth/signup" className="text-blue-600 hover:underline">Sign up</Link></p>
              </div>
            )}

            <button onClick={() => setShowReport(true)} className="w-full flex items-center justify-center gap-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors py-2 border border-red-200">
              <Flag className="w-4 h-4" /> Report this listing
            </button>

            <p className="text-xs text-gray-400 text-center">By booking, you agree to {APP_NAME}&apos;s terms. 85% refund if you don&apos;t take the house.</p>
          </div>
        </div>
      </div>

      {showReport && (
        <ReportModal targetType="listing" targetId={listing.id} targetTitle={listing.title} onClose={() => setShowReport(false)} />
      )}
    </div>
  )
}
