'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Smartphone, ShieldCheck, Loader2, CheckCircle, AlertTriangle, Clock, Phone, Calendar, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import type { Listing } from '@/types'

const MIN_PHONE = 9
const MAX_PHONE = 12

function isValidKenyanPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('254')) return cleaned.length === 12
  if (cleaned.startsWith('0')) return cleaned.length === 10 && /^0[17]\d{8}$/.test(cleaned)
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) return cleaned.length === 9
  return false
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payStep, setPayStep] = useState<'idle' | 'initiating' | 'pending' | 'confirmed' | 'failed'>('idle')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [transactionRequestID, setTransactionRequestID] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)


  useEffect(() => {
    const supabase = createClient()
    supabase.from('listings').select('*').eq('id', id).single().then(({ data }) => {
      if (!data || data.status !== 'published') { router.push('/'); return }
      setListing(data as Listing)
    })

    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (!u) { router.push(`/auth/signin?callbackUrl=/booking/${id}`); return }
      setUser({ id: u.id, email: u.email })
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, email')
        .eq('id', u.id)
        .maybeSingle()
      if (profile?.phone) setPhone(profile.phone)
      if (profile?.email) setEmail(profile.email)
      setLoading(false)
    })
  }, [id, router])

  const handlePay = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!listing) { setError('House not found'); return }
    if (!user) { setError('Please log in'); return }
    if (listing.uploader_id === user.id) { setError('You cannot book your own listing'); return }
    if (!phone.trim()) { setError('Enter your M-Pesa phone number'); return }
    if (!isValidKenyanPhone(phone)) { setError('Enter a valid Kenyan phone number (e.g. 0712345678)'); return }
    if (!email) { setError('Email not found in profile'); return }

    const amount = listing.price || 0
    if (!amount || amount < 1) { setError('Invalid listing price'); return }

    setPayStep('initiating')
    setLoading(true)

    try {
      const res = await fetch('/api/house-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stkpush',
          listing_id: listing.id,
          amount,
          phone,
          email,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to initiate payment')
        setPayStep('idle')
        setLoading(false)
        return
      }
      setBookingId(data.bookingId || null)
      setTransactionRequestID(data.transactionRequestID || null)
      setPayStep('pending')
      setLoading(false)
    } catch {
      setError('Something went wrong')
      setPayStep('idle')
      setLoading(false)
    } finally {
      if (payStep === 'initiating') setLoading(false)
    }
  }, [listing, user, phone, email, payStep])

  const verifyPayment = async () => {
    if (!bookingId || !transactionRequestID) return
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/payments/paywave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          booking_id: bookingId,
          transaction_request_id: transactionRequestID,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        setVerifying(false)
        return
      }
      if (data.status === 'Completed') {
        setPayStep('confirmed')
      } else if (data.status === 'Failed') {
        setPayStep('failed')
      } else {
        setError(`Payment still ${data.status}. Try again shortly.`)
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!listing) return null

  const goToMyBookings = () => router.push('/my-bookings?tab=payments')

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold mb-6 dark:text-white">Pay &amp; Book — {listing.title}</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 space-y-3 dark:bg-slate-800 dark:border-gray-700">
        <img src={listing.images[0] || '/placeholder.jpg'} alt="" className="w-full h-40 rounded-lg object-cover" />
        <h2 className="font-semibold dark:text-white">{listing.title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-300">{listing.location}</p>
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-blue-600">Hunting fee: {formatPrice(listing.price)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-300">Rent: {formatPrice(listing.rent)}/mo</p>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200">
        <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p>
          Pay the one-time hunting fee to book this house. Payment goes to <strong>escrow</strong> — AseHanta holds it
          for <strong>24 hours</strong> while you view the house. Like it? Confirm and the lister gets paid. Not happy?
          Get 85% back. Fake listing? 100% back.
        </p>
      </div>

      {payStep === 'idle' && (
        <form onSubmit={handlePay} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              M-Pesa Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\s/g, ''))}
              placeholder="0712345678"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={MAX_PHONE}
              required
            />
            <p className="text-xs text-gray-500 mt-1">We&apos;ll send an STK push to this number.</p>
          </div>
          {email && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Smartphone className="w-3 h-3" />
              <span>Receipt will be sent to {email}</span>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Sending STK push...</span>
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5"><Smartphone className="w-4 h-4" /> Pay {formatPrice(listing.price)} now</span>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center">
            Amount must be exactly KES {formatPrice(listing.price)} — no more, no less.
          </p>
        </form>
      )}

      {payStep === 'initiating' && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">Sending STK push…</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Check your phone and enter your M-Pesa PIN.</p>
        </div>
      )}

      {payStep === 'pending' && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 text-center space-y-3">
          <Smartphone className="w-8 h-8 text-blue-600 mx-auto" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">STK push sent</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Enter your PIN on your phone to complete payment.</p>
          <div className="flex gap-2">
            <button
              onClick={verifyPayment}
              disabled={verifying}
              className="flex-1 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? (
                <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</span>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Check Payment</span>
              )}
            </button>
            <button
              onClick={goToMyBookings}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" /> View in My Bookings
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}

      {payStep === 'confirmed' && (
        <div className="bg-white border border-green-200 rounded-xl p-4 text-center space-y-3">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto" />
          <p className="text-sm font-medium text-green-900 dark:text-green-200">Payment confirmed!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            KES {formatPrice(listing.price)} is held in escrow for 24 hours.
          </p>
          <button
            onClick={goToMyBookings}
            className="w-full rounded-lg bg-green-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-700"
          >
            <Phone className="w-3.5 h-3.5 mr-1.5" /> Go to My Bookings
          </button>
        </div>
      )}

      {payStep === 'failed' && (
        <div className="bg-white border border-red-200 rounded-xl p-4 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-900 dark:text-red-200">Payment failed</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Your payment could not be confirmed. No money was taken.</p>
          <button
            onClick={() => setPayStep('idle')}
            className="w-full rounded-lg bg-red-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
