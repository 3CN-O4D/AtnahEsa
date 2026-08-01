'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import HouseBookingModal from '@/components/listings/HouseBookingModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER } from '@/lib/constants'
import type { Listing } from '@/types'

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [showBooking, setShowBooking] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('listings').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) router.push('/')
      else setListing(data as Listing)
    })
  }, [id, router])

  if (!listing) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold mb-6">Book Viewing</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 space-y-3">
        <img src={listing.images[0] || '/placeholder.jpg'} alt="" className="w-full h-40 rounded-lg object-cover" />
        <h2 className="font-semibold">{listing.title}</h2>
        <p className="text-sm text-gray-500">{listing.location}</p>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-blue-600">{formatPrice(listing.price)}</p>
          <p className="text-sm text-gray-500">Rent: {formatPrice(listing.rent)}/mo</p>
        </div>
      </div>

      {/* Notice: payment being set up */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p className="font-semibold">Excuse the inconvenience</p>
            <p>
              Online payment is being set up right now. To book this house, use the <strong>WhatsApp</strong> option
              below and we&apos;ll handle everything for you.
            </p>
          </div>
        </div>
      </div>

      <Button onClick={() => setShowBooking(true)} className="w-full" size="lg">
        <MessageCircle className="w-4 h-4 mr-1.5" /> Book via WhatsApp
      </Button>

      <div className="mt-4 space-y-2">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hi AseHanta! I'd like to book a viewing for ${listing.title} (${listing.location}).`
          )}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> Chat Directly on WhatsApp
        </a>
        <p className="text-xs text-gray-400 text-center">
          Fill in your details and we&apos;ll get back to you to arrange the viewing.
        </p>
      </div>

      {showBooking && listing && (
        <HouseBookingModal listing={listing} onClose={() => setShowBooking(false)} />
      )}
    </div>
  )
}
