'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, MessageCircle, AlertTriangle, Copy, Check, CheckCircle, Smartphone, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import HouseBookingModal from '@/components/listings/HouseBookingModal'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { WHATSAPP_NUMBER, TILL_NUMBER } from '@/lib/constants'
import type { Listing } from '@/types'

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const [copied, setCopied] = useState(false)

  // Verify-payment form (visible on the page — no need to open the modal)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [mpesaMessage, setMpesaMessage] = useState('')
  const [transactionCode, setTransactionCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState(false)

  // Tuma STK push payment state
  const [tumaName, setTumaName] = useState('')
  const [tumaPhone, setTumaPhone] = useState('')
  const [tumaArea, setTumaArea] = useState('')
  const [tumaError, setTumaError] = useState('')
  const [tumaLoading, setTumaLoading] = useState(false)
  const [tumaResult, setTumaResult] = useState<{ customer_message?: string; checkout_request_id?: string } | null>(null)

  const copyTill = async () => {
    try {
      await navigator.clipboard.writeText(TILL_NUMBER)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const extractTransactionCode = (message: string) => {
    const match = message.match(/([A-Z][A-Z0-9]{3,})\s+Confirmed/i)
    return match?.[1] || ''
  }

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (!listing) { setFormError('House not found'); return }
    if (!name || !phone || !area || !mpesaMessage) {
      setFormError('Fill in all required fields')
      return
    }
    if (!transactionCode) {
      setFormError('We could not find a transaction code. Paste the full payment confirmation message (e.g. "ABCDE12345 Confirmed. Ksh150.00 sent to ...").')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          listing_title: listing.title,
          listing_location: listing.location,
          listing_price: listing.price,
          name, phone, area, id_number: idNumber,
          mpesa_message: mpesaMessage,
          transaction_code: transactionCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error || 'Something went wrong'); setSubmitting(false); return }
      setFormSuccess(true)
    } catch {
      setFormError('Something went wrong')
    } finally { setSubmitting(false) }
  }

  const handleTumaPay = async (e: React.FormEvent) => {
    e.preventDefault()
    setTumaError('')
    if (!listing) { setTumaError('House not found'); return }
    if (!tumaName || !tumaPhone || !tumaArea) { setTumaError('Fill in your name, phone, and area'); return }

    setTumaLoading(true)
    try {
      const res = await fetch('/api/payments/tuma-stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.id,
          listing_location: listing.location,
          listing_price: listing.price,
          name: tumaName,
          phone: tumaPhone,
          area: tumaArea,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setTumaError(data.error || 'Failed to initiate payment'); setTumaLoading(false); return }
      setTumaResult({ customer_message: data.customer_message, checkout_request_id: data.checkout_request_id })
    } catch {
      setTumaError('Something went wrong')
    } finally { setTumaLoading(false) }
  }

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
            <p className="font-semibold">How to pay for this house</p>
            <p>
              Pay instantly via <strong>Tuma / M-Pesa</strong> below (auto-verified), or pay <strong>manually via
              Till</strong> and paste your M-Pesa confirmation. WhatsApp us anytime and we&apos;ll handle it for you.
            </p>
          </div>
        </div>
      </div>

      {/* Pay via Till */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-blue-800 mb-1">Or Pay Directly via M-Pesa Till</p>
        <p className="text-xs text-blue-700 mb-2">
          Send the {formatPrice(listing.price)} hunting fee to the Till number below, paste the M-Pesa confirmation
          message in the booking form, and we&apos;ll verify your payment and release the house.
        </p>
        <div className="flex items-center justify-between bg-white border border-blue-200 rounded-lg px-4 py-3">
          <div>
            <p className="text-xs text-gray-500">Till Number</p>
            <p className="text-2xl font-bold tracking-wider text-blue-700">{TILL_NUMBER}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-right">
              <p className="text-xs text-gray-500">Amount</p>
              <p className="text-sm font-semibold">{formatPrice(listing.price)}</p>
            </div>
            <button
              onClick={copyTill}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Till'}
            </button>
          </div>
        </div>
      </div>

      {/* Pay instantly via Tuma */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-4 h-4 text-green-700" />
          <p className="text-sm font-semibold text-green-800">Or Pay Instantly via Tuma (M-Pesa)</p>
        </div>
        <p className="text-xs text-green-700 mb-3">
          No Till needed. Enter your M-Pesa phone number and we&apos;ll send you a prompt to pay the{' '}
          {formatPrice(listing.price)} hunting fee instantly. Your payment is verified automatically.
        </p>

        {tumaResult ? (
          <div className="bg-white border border-green-200 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-green-800 space-y-1">
                <p className="font-semibold">M-Pesa prompt sent!</p>
                <p>{tumaResult.customer_message || 'Check your phone and enter your PIN to complete payment.'}</p>
                {tumaResult.checkout_request_id && (
                  <p className="text-xs text-gray-500">Payment ref: {tumaResult.checkout_request_id}</p>
                )}
                <p className="text-xs text-green-700">
                  Once you pay, we&apos;ll confirm automatically and contact you to arrange the viewing.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleTumaPay} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={tumaName} onChange={(e) => setTumaName(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">M-Pesa Phone Number <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={tumaPhone}
                onChange={(e) => setTumaPhone(e.target.value)}
                placeholder="0712 345 678"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Area / Location <span className="text-red-500">*</span></label>
              <input type="text" value={tumaArea} onChange={(e) => setTumaArea(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
            </div>

            {tumaError && <p className="text-sm text-red-600">{tumaError}</p>}

            <button
              type="submit"
              disabled={tumaLoading}
              className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tumaLoading ? (
                <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Sending prompt...</span>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5"><Smartphone className="w-4 h-4" /> Pay {formatPrice(listing.price)} via M-Pesa</span>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Verify payment — always visible on the page */}
      <div className="bg-white border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-6">
        {formSuccess ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-bold mb-1">Payment Details Submitted!</h2>
            <p className="text-sm text-gray-500">
              We&apos;ve received your details and will confirm your payment shortly. We&apos;ll contact you via <strong>call</strong> or <strong>WhatsApp</strong> once your house is released.
            </p>
            <div className="flex gap-2 mt-4">
              <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `Hi AseHanta! I've paid the hunting fee for ${listing.title} (${listing.location}) via Till ${TILL_NUMBER}.\n\nName: ${name}\nPhone: ${phone}\nArea: ${area}${idNumber ? `\nID No: ${idNumber}` : ''}\nTransaction Code: ${transactionCode}${mpesaMessage ? `\n\nPayment Message:\n${mpesaMessage}` : ''}`
              )}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors">
                <MessageCircle className="w-4 h-4" /> WhatsApp Now
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerifySubmit} className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Already paid? Verify your payment
            </h2>
            <p className="text-xs text-gray-500 -mt-1">
              Paste your <strong>payment confirmation message</strong> below and we&apos;ll verify it and release the house.
              Paid via the new <strong>Tuma / M-Pesa</strong> option and something went wrong? Paste your message here too — our team will reach out.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number <span className="text-red-500">*</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Area / Location <span className="text-red-500">*</span></label>
              <input type="text" value={area} onChange={(e) => setArea(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Number <span className="text-gray-400">(optional)</span></label>
              <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Confirmation Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={mpesaMessage}
                onChange={(e) => {
                  const msg = e.target.value
                  setMpesaMessage(msg)
                  setTransactionCode(extractTransactionCode(msg))
                }}
                rows={3}
                placeholder="Paste the payment confirmation message you received here (e.g. &quot;ABCDE12345 Confirmed. Ksh150.00 sent to ...&quot;)"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              {transactionCode ? (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Transaction code detected: <strong>{transactionCode}</strong>
                </p>
              ) : mpesaMessage ? (
                <p className="text-xs text-amber-600 mt-1">Transaction code not found. Paste the full confirmation message.</p>
              ) : null}
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <button type="submit" disabled={submitting || !mpesaMessage} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Submitting...' : 'Submit Payment Details'}
            </button>
          </form>
        )}
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
