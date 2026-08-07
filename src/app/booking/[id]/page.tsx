'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Smartphone, Landmark, Copy, Check, CheckCircle, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { TILL_NUMBER } from '@/lib/constants'
import type { Listing } from '@/types'

type PayTab = 'tuma' | 'till'

const extractTransactionCode = (message: string) => message.match(/([A-Z][A-Z0-9]{3,})\s+Confirmed/i)?.[1] || ''

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [tab, setTab] = useState<PayTab>('tuma')
  const [copiedTill, setCopiedTill] = useState(false)

  // Shared phone input, prefilled from the logged-in profile.
  const [phone, setPhone] = useState('')
  const [phoneLoaded, setPhoneLoaded] = useState(false)

  // Tuma STK push state
  const [tumaError, setTumaError] = useState('')
  const [tumaLoading, setTumaLoading] = useState(false)
  const [tumaResult, setTumaResult] = useState<{ customer_message?: string; checkout_request_id?: string; booking_id?: string } | null>(null)
  const [contactSaved, setContactSaved] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactArea, setContactArea] = useState('')
  const [contactError, setContactError] = useState('')
  const [contactLoading, setContactLoading] = useState(false)

  // Till (Safaricom Buy Goods) manual verification state
  const [tillMessage, setTillMessage] = useState('')
  const [tillCode, setTillCode] = useState('')
  const [tillError, setTillError] = useState('')
  const [tillLoading, setTillLoading] = useState(false)
  const [tillSuccess, setTillSuccess] = useState(false)

  const copyTill = async () => {
    try { await navigator.clipboard.writeText(TILL_NUMBER); setCopiedTill(true); setTimeout(() => setCopiedTill(false), 2000) } catch {}
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.from('listings').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) router.push('/')
      else setListing(data as Listing)
    })

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.phone) setPhone(profile.phone)
      }
      setPhoneLoaded(true)
    })
  }, [id, router])

  const handleTumaPay = async (e: React.FormEvent) => {
    e.preventDefault()
    setTumaError('')
    if (!listing) { setTumaError('House not found'); return }
    if (!phone.trim()) { setTumaError('Enter your M-Pesa phone number'); return }

    setTumaLoading(true)
    try {
      const res = await fetch('/api/payments/tuma-stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          listing_price: listing.price,
          phone,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setTumaError(data.error || 'Failed to initiate payment'); setTumaLoading(false); return }
      setTumaResult({ customer_message: data.customer_message, checkout_request_id: data.checkout_request_id, booking_id: data.booking_id })
    } catch {
      setTumaError('Something went wrong')
    } finally { setTumaLoading(false) }
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setContactError('')
    if (!tumaResult?.booking_id) { setContactError('Payment reference missing'); return }
    if (!contactName.trim()) { setContactError('Enter your name'); return }

    setContactLoading(true)
    try {
      const res = await fetch('/api/house-bookings/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: tumaResult.booking_id,
          name: contactName,
          area: contactArea,
          phone,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setContactError(data.error || 'Something went wrong'); setContactLoading(false); return }
      setContactSaved(true)
    } catch {
      setContactError('Something went wrong')
    } finally { setContactLoading(false) }
  }

  const isTillMessageValid = (message: string) => {
    const m = message.toUpperCase()
    return /ASEHANTA\s+INVESTMENTS/i.test(message) || /Tuma|I&M|I AND M|tinua/i.test(message)
  }

  const handleTillSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTillError('')
    if (!listing) { setTillError('House not found'); return }
    if (!phone.trim()) { setTillError('Enter your phone number'); return }
    if (!tillMessage.trim()) { setTillError('Paste the M-Pesa confirmation message'); return }
    if (!tillCode) { setTillError('We could not find a transaction code. Paste the full M-Pesa confirmation (e.g. "ABCDE12345 Confirmed. Ksh150.00 sent to ...")'); return }
    if (!isTillMessageValid(tillMessage)) { setTillError('This does not look like a valid M-Pesa confirmation to AseHanta. Paste the exact message you received.'); return }

    setTillLoading(true)
    try {
      const res = await fetch('/api/bookings/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          listing_title: listing.title,
          listing_location: listing.location,
          listing_price: listing.price,
          phone,
          mpesa_message: tillMessage,
          transaction_code: tillCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setTillError(data.error || 'Something went wrong'); setTillLoading(false); return }
      setTillSuccess(true)
    } catch {
      setTillError('Something went wrong')
    } finally { setTillLoading(false) }
  }

  if (!listing) {
    return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>
  }

  const phoneInput = (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        M-Pesa / Pay Bill Phone Number <span className="text-red-500">*</span>
      </label>
      <input
        type="tel"
        inputMode="numeric"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="0712 345 678"
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      {phoneLoaded && phone && <p className="text-xs text-blue-500 mt-1">Prefilled from your profile — you can edit it.</p>}
    </div>
  )

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold mb-6 dark:text-white">Pay &amp; Book — {listing.title}</h1>

      <div className="bg-white border rounded-xl p-4 mb-6 space-y-3 dark:bg-gray-800 dark:border-gray-700">
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
        <p>Pay the one-time hunting fee to unlock this house. Pick a method, enter your phone number, and we&apos;ll handle the rest. We&apos;ll contact you to arrange the viewing once your payment is confirmed.</p>
      </div>

      {/* Payment method tabs */}
      <div className="flex p-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <button
          onClick={() => setTab('tuma')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'tuma' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 dark:text-white hover:text-gray-800'}`}
        >
          <Landmark className="w-4 h-4" /> Pay Instantly (Tuma)
        </button>
        <button
          onClick={() => setTab('till')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === 'till' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 dark:text-white hover:text-gray-800'}`}
        >
          <Smartphone className="w-4 h-4" /> Buy Goods Till
        </button>
      </div>

      {/* Tuma tab */}
      {tab === 'tuma' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 dark:bg-blue-900/30 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-blue-700 dark:text-blue-300" />
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Pay instantly via Tuma (I&amp;M Bank)</p>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
            Instant M-Pesa STK push prompt on your phone. Payment is verified automatically.
          </p>

          {tumaResult ? (
            <div className="space-y-3">
              <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <div className="text-blue-900 dark:text-blue-100 space-y-1">
                    <p className="font-semibold">Payment prompt sent!</p>
                    <p>{tumaResult.customer_message || 'Check your phone and enter your PIN to complete payment.'}</p>
                    {tumaResult.checkout_request_id && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Payment ref: {tumaResult.checkout_request_id}</p>
                    )}
                  </div>
                </div>
              </div>

              {contactSaved ? (
                <div className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div className="text-green-900 dark:text-green-100 space-y-1">
                      <p className="font-semibold">You&apos;re all set!</p>
                      <p>We&apos;ll confirm your payment automatically and link you with the lister. Track your booking and release/refund in <strong>My Bookings</strong>.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Complete your booking — this links you with the lister.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Area / Location</label>
                    <input type="text" value={contactArea} onChange={(e) => setContactArea(e.target.value)} placeholder="e.g. Eldoret, Langas" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {contactError && <p className="text-sm text-red-600">{contactError}</p>}
                  <button type="submit" disabled={contactLoading} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {contactLoading ? 'Saving...' : 'Save & Continue'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form onSubmit={handleTumaPay} className="space-y-3">
              {phoneInput}
              {tumaError && <p className="text-sm text-red-600">{tumaError}</p>}
              <button
                type="submit"
                disabled={tumaLoading}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tumaLoading ? (
                  <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Sending prompt...</span>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5"><Landmark className="w-4 h-4" /> Pay {formatPrice(listing.price)} by Tuma</span>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Till tab */}
      {tab === 'till' && (
        <div className="space-y-4 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 dark:bg-green-900/30 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-green-700 dark:text-green-300" />
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">Pay via Safaricom Buy Goods Till</p>
            </div>
            <p className="text-xs text-green-700 dark:text-green-300 mb-3">
              Send the {formatPrice(listing.price)} hunting fee to the Till number below, then paste your M-Pesa confirmation to verify.
            </p>
            <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Till Number</p>
                <p className="text-2xl font-bold tracking-wider text-green-700 dark:text-green-300">{TILL_NUMBER}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Amount</p>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">{formatPrice(listing.price)}</p>
                </div>
                <button
                  type="button"
                  onClick={copyTill}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 transition-colors"
                >
                  {copiedTill ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedTill ? 'Copied!' : 'Copy Till'}
                </button>
              </div>
            </div>
          </div>

          {tillSuccess ? (
            <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 text-center py-6">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-bold mb-1 dark:text-white">Payment Details Submitted!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-300">
                We&apos;ve received your details and will confirm your payment shortly. We&apos;ll contact you via <strong>call</strong> or <strong>WhatsApp</strong> once your house is released.
              </p>
            </div>
          ) : (
            <form onSubmit={handleTillSubmit} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 space-y-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Confirm your payment</h2>
              {phoneInput}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  M-Pesa Confirmation Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={tillMessage}
                  onChange={(e) => {
                    const msg = e.target.value
                    setTillMessage(msg)
                    setTillCode(extractTransactionCode(msg))
                  }}
                  rows={3}
                  placeholder="Paste the M-Pesa confirmation message you received here (e.g. &quot;ABCDE12345 Confirmed. Ksh150.00 sent to ...&quot;)"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                {tillCode ? (
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Transaction code detected: <strong>{tillCode}</strong>
                  </p>
                ) : tillMessage ? (
                  <p className="text-xs text-amber-600 mt-1">Transaction code not found. Paste the full M-Pesa confirmation.</p>
                ) : null}
              </div>
              {tillError && <p className="text-sm text-red-600">{tillError}</p>}
              <button type="submit" disabled={tillLoading || !tillMessage} className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {tillLoading ? 'Submitting...' : 'Submit for Verification'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}