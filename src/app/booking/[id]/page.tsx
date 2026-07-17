'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Smartphone, MessageSquare, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { MIN_BOOKING_FEE, APP_NAME } from '@/lib/constants'
import type { Listing, Booking, EscrowHold } from '@/types'

type PaymentMethod = 'stk' | 'manual'

const REPORT_REASONS = [
  { value: 'scam', label: 'Scam/Fake Listing' },
  { value: 'not_as_advertised', label: 'Not What Was Advertised' },
  { value: 'hidden_issues', label: 'Hidden Issues Were Not Disclosed' },
  { value: 'other', label: 'Other' },
]

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [mpesaMessage, setMpesaMessage] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stk')
  const [stkSent, setStkSent] = useState(false)
  const [checkoutRequestId, setCheckoutRequestId] = useState('')

  const [booking, setBooking] = useState<Booking | null>(null)
  const [escrowHold, setEscrowHold] = useState<EscrowHold | null>(null)
  const [step, setStep] = useState<'payment' | 'dashboard'>('payment')

  const [showRefundModal, setShowRefundModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [countdown, setCountdown] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/auth/signin')
      else setUser(data.user)
    })
    supabase.from('listings').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) router.push('/')
      else setListing(data as Listing)
    })
  }, [id, router])

  useEffect(() => {
    if (!escrowHold?.held_until) return
    const update = () => {
      const diff = new Date(escrowHold.held_until).getTime() - Date.now()
      if (diff <= 0) { setCountdown('Ready'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(`${h}h ${m}m ${s}s`)
    }
    update()
    const i = setInterval(update, 1000)
    return () => clearInterval(i)
  }, [escrowHold?.held_until])

  const createEscrowHold = useCallback(async (bookingId: string) => {
    if (!listing || !user) return
    const supabase = createClient()
    const heldUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: escrow } = await supabase.from('escrow_holds').insert({
      booking_id: bookingId, user_id: user.id, listing_id: listing.id,
      amount: listing.price, status: 'held', held_until: heldUntil,
    }).select().single()
    if (escrow) {
      await supabase.from('bookings').update({ escrow_hold_id: escrow.id }).eq('id', bookingId)
      const { data: b } = await supabase.from('bookings').select('*').eq('id', bookingId).single()
      if (b) setBooking(b as Booking)
      setEscrowHold(escrow as EscrowHold)
      setStep('dashboard')
    }
  }, [listing, user])

  const handleStkPush = async () => {
    if (!listing || !user) return
    if (!phone || phone.length < 10) { setError('Enter a valid M-Pesa phone number'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/payments/stk-push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, phone }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Failed to initiate payment')
      else { setCheckoutRequestId(data.checkout_request_id); setStkSent(true) }
    } catch { setError('Failed to initiate payment') } finally { setLoading(false) }
  }

  const handleStkConfirm = async () => {
    if (!listing || !user || !checkoutRequestId) return
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: tx } = await supabase.from('transactions')
        .select('booking_id').eq('checkout_request_id', checkoutRequestId).single()
      if (tx) {
        const { data: eb } = await supabase.from('bookings').select('*').eq('id', tx.booking_id).single()
        if (eb?.status === 'confirmed') { await createEscrowHold(eb.id); setLoading(false); return }
      }
      setError('Payment not yet confirmed. Check M-Pesa and try again.')
    } catch { setError('Failed to confirm payment') } finally { setLoading(false) }
  }

  const handleManualVerify = async () => {
    if (!listing || !user) return
    if (!phone || phone.length < 10) { setError('Enter your M-Pesa phone number'); return }
    if (!mpesaMessage.trim()) { setError('Paste the M-Pesa confirmation message'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/payments/verify-manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, phone, mpesa_message: mpesaMessage }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Verification failed')
      else await createEscrowHold(data.booking.id)
    } catch { setError('Verification failed') } finally { setLoading(false) }
  }

  const handleReleaseFunds = async () => {
    if (!escrowHold || !booking || !listing || !user) return
    setReleasing(true); setError('')
    try {
      const supabase = createClient()
      await supabase.from('escrow_holds').update({ status: 'released', released_at: new Date().toISOString() }).eq('id', escrowHold.id)
      await supabase.from('bookings').update({ release_status: 'released' }).eq('id', booking.id)
      await supabase.from('transactions').insert({
        booking_id: booking.id, user_id: user.id, phone: booking.phone,
        amount: listing.price, mpesa_receipt: '', mpesa_message: 'Funds released to lister',
        checkout_request_id: '', status: 'success',
      })
      setEscrowHold({ ...escrowHold, status: 'released' })
    } catch { setError('Failed to release funds') } finally { setReleasing(false) }
  }

  const handleSubmitReport = async () => {
    if (!booking || !user || !listing || !escrowHold) return
    if (!reportReason) { setError('Please select a reason'); return }
    if (reportReason === 'other' && customReason.trim().split(/\s+/).filter(Boolean).length < 4) {
      setError('Please provide at least 4 words'); return
    }
    setSubmitting(true); setError('')
    try {
      const supabase = createClient()
      const refundAmount = Math.round(listing.price * 0.85)
      const { data: report } = await supabase.from('reports').insert({
        booking_id: booking.id, user_id: user.id, listing_id: listing.id,
        reason: reportReason, custom_reason: reportReason === 'other' ? customReason : '',
      }).select().single()
      if (report) {
        await supabase.from('escrow_holds').update({ status: 'refunded', refunded_at: new Date().toISOString() }).eq('id', escrowHold.id)
        await supabase.from('bookings').update({ release_status: 'refunded', refund_percentage: 85, refund_amount: refundAmount, report_id: report.id }).eq('id', booking.id)
        setEscrowHold({ ...escrowHold, status: 'refunded' })
        setShowRefundModal(false)
      }
    } catch { setError('Failed to process refund') } finally { setSubmitting(false) }
  }

  if (!listing) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  if (step === 'dashboard') {
    const refundAmount = Math.round(listing.price * 0.85)
    const isReleased = escrowHold?.status === 'released'
    const isRefunded = escrowHold?.status === 'refunded'

    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-gray-600">Your hunting fee for <strong>{listing.title}</strong> has been paid and is held securely.</p>
        </div>

        {isReleased ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 mb-6">
            <p className="font-medium">Funds Released ✓</p>
            <p>The hunting fee has been released to the lister.</p>
          </div>
        ) : isRefunded ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-6">
            <p className="font-medium">Refund Processed ✓</p>
            <p>{formatPrice(refundAmount)} (85%) has been refunded. The remaining 15% covers platform costs.</p>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 mb-6 space-y-3">
              <div className="flex items-center gap-2 font-medium"><Clock className="w-4 h-4" /> Held in Escrow 🔒</div>
              <div className="flex justify-between"><span>Amount Held</span><span className="font-semibold">{formatPrice(escrowHold?.amount || 0)}</span></div>
              <div className="flex justify-between"><span>Time Remaining</span><span className="font-semibold">{countdown || 'Calculating...'}</span></div>
              <hr className="border-blue-200" />
              <p className="text-xs">Money auto-releases to the lister after 24hrs. You can release early or request a refund below.</p>
            </div>

            <div className="text-sm text-gray-600 mb-6 space-y-2">
              <p className="font-medium text-gray-800">What would you like to do?</p>
              <button onClick={handleReleaseFunds} disabled={releasing}
                className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
                {releasing ? 'Releasing...' : '✓ I Like the House — Release Funds'}
              </button>
              <button onClick={() => setShowRefundModal(true)}
                className="w-full bg-white border border-red-200 text-red-600 rounded-xl py-3 font-semibold text-sm hover:bg-red-50 transition-colors">
                ✕ I Don't Want It — Request 85% Refund
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">85% refund policy: 15% covers listing costs and transaction fees.</p>
          </>
        )}

        <div className="mt-6 text-center">
          <button onClick={() => router.push('/')} className="text-sm text-blue-600 hover:underline">Back to Home</button>
        </div>

        {/* Refund / Report Modal */}
        {showRefundModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 relative">
              <button onClick={() => setShowRefundModal(false)} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
              <h2 className="text-lg font-bold mb-4">Before We Process Your Refund</h2>
              <p className="text-sm text-gray-500 mb-4">Help us improve by telling us why you're returning the house.</p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Reason</label>
                  <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select a reason...</option>
                    {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {reportReason === 'other' && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700">Describe the issue <span className="text-red-500">*</span></label>
                    <textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="At least 4 words..."
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3} />
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  <p><strong>Refund Amount:</strong> {formatPrice(Math.round(listing.price * 0.85))} (85%)</p>
                  <p className="text-xs mt-1">15% deducted for listing removal and transaction costs.</p>
                </div>
                <Button onClick={handleSubmitReport} loading={submitting} className="w-full">Submit & Get Refund</Button>
              </div>
            </div>
          </div>
        )}
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
        <p className="text-gray-600 mb-4">An M-Pesa STK push has been sent to <strong>{phone}</strong>. Enter your PIN to complete payment.</p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 mb-6">
          <p className="font-medium mb-1">Didn't receive the prompt?</p>
          <p>Make sure your phone is on and has enough M-Pesa balance. The prompt expires in 60 seconds.</p>
        </div>
        <div className="space-y-3">
          <Button onClick={handleStkConfirm} loading={loading}>I've Paid — Confirm</Button>
          <Button variant="outline" onClick={() => { setStkSent(false); setLoading(false) }} className="w-full">Try Again</Button>
        </div>
      </div>
    )
  }

  const platformFee = Math.round(listing.price * 0.3)
  const ownerPayout = Math.round(listing.price * 0.7)

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Book Viewing</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 space-y-3">
        <img src={listing.images[0] || '/placeholder.jpg'} alt="" className="w-full h-40 rounded-lg object-cover" />
        <h2 className="font-semibold">{listing.title}</h2>
        <p className="text-sm text-gray-500">{listing.location}</p>
        <p className="text-lg font-bold text-blue-600">{formatPrice(listing.price)}</p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-500">Hunting Fee</span>
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
        <div className="flex justify-between font-semibold"><span>You Pay</span><span>{formatPrice(listing.price)}</span></div>
      </div>

      <div className="flex border rounded-lg mb-6 overflow-hidden">
        <button onClick={() => setPaymentMethod('stk')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${paymentMethod === 'stk' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          <Smartphone className="w-4 h-4 inline mr-1.5" /> STK Push
        </button>
        <button onClick={() => setPaymentMethod('manual')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${paymentMethod === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          <MessageSquare className="w-4 h-4 inline mr-1.5" /> Pay to Till
        </button>
      </div>

      <div className="space-y-4">
        <Input label="M-Pesa Phone Number" id="phone" type="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />

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
              <label htmlFor="mpesa-message" className="block text-sm font-medium text-gray-700">Paste M-Pesa Confirmation Message</label>
              <textarea id="mpesa-message" rows={3} placeholder="Paste the full M-Pesa confirmation message here..." value={mpesaMessage}
                onChange={(e) => setMpesaMessage(e.target.value)} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3"><p className="text-sm text-red-600">{error}</p></div>}

        {paymentMethod === 'stk' ? (
          <Button onClick={handleStkPush} loading={loading} disabled={listing.price < MIN_BOOKING_FEE} className="w-full" size="lg">
            <Smartphone className="w-4 h-4 mr-1.5" /> Pay {formatPrice(listing.price)} via M-Pesa
          </Button>
        ) : (
          <Button onClick={handleManualVerify} loading={loading} disabled={listing.price < MIN_BOOKING_FEE} className="w-full" size="lg">
            <MessageSquare className="w-4 h-4 mr-1.5" /> Verify Payment
          </Button>
        )}
      </div>
    </div>
  )
}
