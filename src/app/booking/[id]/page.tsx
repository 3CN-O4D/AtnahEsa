'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Smartphone, MessageSquare, CheckCircle, Loader } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, cn } from '@/lib/utils'
import { MIN_BOOKING_FEE, PLATFORM_COMMISSION, OWNER_SHARE, APP_NAME } from '@/lib/constants'
import type { Listing } from '@/types'

type PaymentMethod = 'stk' | 'manual'

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [user, setUser] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [phone, setPhone] = useState('')
  const [mpesaMessage, setMpesaMessage] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stk')
  const [stkSent, setStkSent] = useState(false)
  const [checkoutRequestId, setCheckoutRequestId] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth/signin')
      else setUser(data.user)
    })

    supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) router.push('/')
        else setListing(data as Listing)
      })
  }, [id, router])

  const handleStkPush = async () => {
    if (!listing || !user) return
    if (!phone || phone.length < 10) {
      setError('Enter a valid M-Pesa phone number')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/payments/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, phone }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to initiate payment')
      } else {
        setCheckoutRequestId(data.checkout_request_id)
        setStkSent(true)
      }
    } catch {
      setError('Failed to initiate payment. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleManualVerify = async () => {
    if (!listing || !user) return
    if (!phone || phone.length < 10) {
      setError('Enter your M-Pesa phone number')
      return
    }
    if (!mpesaMessage.trim()) {
      setError('Paste the M-Pesa confirmation message')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/payments/verify-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          phone,
          mpesa_message: mpesaMessage,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Verification failed')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!listing) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Booking Confirmed!</h1>
        <p className="text-gray-600 mb-6">
          Your viewing for <strong>{listing.title}</strong> has been booked.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 text-left mb-6 space-y-2">
          <p className="font-medium">Held in Escrow 🔒</p>
          <p>Your money is safely held by {APP_NAME}. It is only released to the lister after you confirm the property is genuine.</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 text-left mb-6 space-y-2">
          <p>You&apos;ll be contacted shortly to arrange the viewing time.</p>
          <p><strong>Refund Policy:</strong></p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Property is <strong>fake</strong> or uploader <strong>no-shows</strong> → <span className="text-green-600 font-medium">100% refund</span></li>
            <li>You view it but <strong>don&apos;t like it</strong> → <span className="text-amber-600 font-medium">60% refund</span> (40% covers marketing & coordination)</li>
            <li>You <strong>confirm and take it</strong> → money released to lister, house marked as taken</li>
          </ul>
        </div>
        <Button onClick={() => router.push('/')}>Back to Home</Button>
      </div>
    )
  }

  if (stkSent) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Smartphone className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check Your Phone</h1>
        <p className="text-gray-600 mb-4">
          An M-Pesa STK push has been sent to <strong>{phone}</strong>.
          Enter your PIN to complete payment.
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 mb-6">
          <p className="font-medium mb-1">Didn&apos;t receive the prompt?</p>
          <p>Make sure your phone is on and has enough M-Pesa balance. The prompt expires in 60 seconds.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { setStkSent(false); setLoading(false) }}
        >
          Try Again
        </Button>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  const platformFee = Math.round(listing.price * PLATFORM_COMMISSION)
  const ownerPayout = Math.round(listing.price * OWNER_SHARE)

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Book Viewing</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 space-y-3">
        <img
          src={listing.images[0] || '/placeholder.jpg'}
          alt=""
          className="w-full h-40 rounded-lg object-cover"
        />
        <h2 className="font-semibold">{listing.title}</h2>
        <p className="text-sm text-gray-500">{listing.location}</p>
        <p className="text-lg font-bold text-blue-600">{formatPrice(listing.price)}</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-500">Viewing Fee</span>
          <span className="font-medium">{formatPrice(listing.price)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>{APP_NAME} Commission (30%)</span>
          <span>-{formatPrice(platformFee)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Owner Payout (70%)</span>
          <span className="text-green-600">+{formatPrice(ownerPayout)}</span>
        </div>
        <hr />
        <div className="flex justify-between font-semibold">
          <span>You Pay</span>
          <span>{formatPrice(listing.price)}</span>
        </div>
        {listing.price < MIN_BOOKING_FEE && (
          <p className="text-red-500 text-xs">
            Minimum booking fee is {formatPrice(MIN_BOOKING_FEE)}
          </p>
        )}
      </div>

      {/* Payment method toggle */}
      <div className="flex border rounded-lg mb-6 overflow-hidden">
        <button
          onClick={() => setPaymentMethod('stk')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            paymentMethod === 'stk' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Smartphone className="w-4 h-4 inline mr-1.5" />
          STK Push
        </button>
        <button
          onClick={() => setPaymentMethod('manual')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            paymentMethod === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-1.5" />
          Pay to Till
        </button>
      </div>

      <div className="space-y-4">
        <Input
          label="M-Pesa Phone Number"
          id="phone"
          type="tel"
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        {paymentMethod === 'manual' && (
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
              <p className="font-medium">Pay via M-Pesa Till Number</p>
              <p>1. Go to M-Pesa on your phone</p>
              <p>2. Select <strong>Lipa na M-Pesa</strong> &gt; <strong>Buy Goods</strong></p>
              <p>3. Enter Till Number: <strong className="text-lg">{process.env.NEXT_PUBLIC_DARAJA_TILL_NUMBER || 'N/A'}</strong></p>
              <p>4. Enter Amount: <strong>{formatPrice(listing.price)}</strong></p>
              <p>5. Enter your PIN and confirm</p>
              <p>6. Copy the confirmation message and paste it below</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="mpesa-message" className="block text-sm font-medium text-gray-700">
                Paste M-Pesa Confirmation Message
              </label>
              <textarea
                id="mpesa-message"
                rows={3}
                placeholder="Paste the full M-Pesa confirmation message here..."
                value={mpesaMessage}
                onChange={(e) => setMpesaMessage(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {paymentMethod === 'stk' ? (
          <Button
            onClick={handleStkPush}
            loading={loading}
            disabled={listing.price < MIN_BOOKING_FEE}
            className="w-full"
            size="lg"
          >
            <Smartphone className="w-4 h-4 mr-1.5" />
            Pay {formatPrice(listing.price)} via M-Pesa
          </Button>
        ) : (
          <Button
            onClick={handleManualVerify}
            loading={loading}
            disabled={listing.price < MIN_BOOKING_FEE}
            className="w-full"
            size="lg"
          >
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Verify Payment
          </Button>
        )}
      </div>
    </div>
  )
}