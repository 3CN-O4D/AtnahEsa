'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { MapPin, AlertTriangle, DollarSign, Video, ArrowLeft, Calendar, Zap, Droplets, Home, Info } from 'lucide-react'
import Slideshow from '@/components/ui/Slideshow'
import ImageViewer from '@/components/ui/ImageViewer'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { APP_NAME } from '@/lib/constants'
import type { Listing } from '@/types'

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [showViewer, setShowViewer] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) router.push('/')
        else setListing(data as Listing)
        setLoading(false)
      })
  }, [id, router])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!listing) return null

  const youtubeId = listing.youtube_url
    ? listing.youtube_url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      )?.[1]
    : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="relative">
        <Slideshow
          images={listing.images}
          className="w-full aspect-video mb-6"
          onImageClick={(i) => { setViewerIndex(i); setShowViewer(true) }}
        />
        {showViewer && (
          <ImageViewer
            images={listing.images}
            initialIndex={viewerIndex}
            onClose={() => setShowViewer(false)}
          />
        )}
        {listing.status === 'booked' && (
          <div className="absolute top-4 right-4 bg-amber-500 text-white text-sm font-medium px-3 py-1 rounded-full">
            Booked
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{listing.title}</h1>
            <div className="flex items-center gap-1 text-gray-500">
              <MapPin className="w-4 h-4" />
              <span>{listing.location}</span>
            </div>
          </div>

          {/* Price details */}
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
                <p className="text-xs text-purple-500">Refundable</p>
              </div>
            )}
            {listing.electricity && (
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xs text-amber-600 font-medium">Electricity</p>
                <p className="text-sm font-semibold text-amber-700">{listing.electricity}</p>
              </div>
            )}
            {listing.water && (
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Water</p>
                <p className="text-sm font-semibold text-emerald-700">{listing.water}</p>
              </div>
            )}
          </div>

          {listing.why_vacant && (
            <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              <span><strong>Why vacant:</strong> {listing.why_vacant}</span>
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
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                House Issues
              </h2>
              <ul className="space-y-1.5">
                {listing.issues.map((issue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {youtubeId && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Video className="w-5 h-5 text-red-500" />
                Video Tour
              </h2>
              <div className="aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}`}
                  title="House Video Tour"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-4 space-y-4 sticky top-24">
            <div>
              <p className="text-sm text-gray-500">Monthly Rent</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(listing.rent)}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Viewing Fee</p>
              <p className="text-xl font-semibold text-blue-600">{formatPrice(listing.price)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Paid once to book a viewing (60% refundable if not satisfied)
              </p>
            </div>

            <hr />

            <div className="text-xs text-gray-500 space-y-1">
              <p><strong>Listed by:</strong> {listing.uploader_name}</p>
              <p><strong>Issues reported:</strong> {listing.issues.length}</p>
              <p><strong>Listed on:</strong> {new Date(listing.created_at).toLocaleDateString()}</p>
            </div>

            <Link href={`/booking/${listing.id}`}>
              <Button className="w-full">
                <Calendar className="w-4 h-4 mr-1.5" />
                Book Viewing
              </Button>
            </Link>

            <p className="text-xs text-gray-400 text-center">
              By booking, you agree to {APP_NAME}&apos;s terms. 60% refund if you don&apos;t take the house.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}