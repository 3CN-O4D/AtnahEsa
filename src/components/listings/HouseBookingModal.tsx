'use client'

import { useState } from 'react'
import { X, MessageCircle, Phone, Check, Copy, CheckCircle } from 'lucide-react'
import { WHATSAPP_NUMBER, CONTACT_PHONE, TILL_NUMBER } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import type { Listing } from '@/types'

interface HouseBookingModalProps {
  listing: Listing
  onClose: () => void
}

export default function HouseBookingModal({ listing, onClose }: HouseBookingModalProps) {
  const [step, setStep] = useState<'form' | 'submitted'>('form')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [mpesaMessage, setMpesaMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [phoneChanged, setPhoneChanged] = useState(false)

  const copyTill = async () => {
    try {
      await navigator.clipboard.writeText(TILL_NUMBER)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !phone || !area || !mpesaMessage) { setError('Fill in all required fields'); return }
    setLoading(true); setError('')

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
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setLoading(false); return }
      setContactPhone(phone)
      setStep('submitted')
    } catch {
      setError('Something went wrong')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        {step === 'form' ? (
          <>
            <h2 className="text-lg font-bold mb-1">Book Viewing — {listing.title}</h2>
            <p className="text-sm text-gray-500 mb-4">
              {listing.location} &mdash; {formatPrice(listing.price)} hunting fee
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 mb-4">
              <p>
                <strong>Excuse the inconvenience.</strong> Online payment is being set up right now. For now, book your
                viewing via <strong>WhatsApp</strong> and we&apos;ll arrange everything for you.
              </p>
            </div>

            {/* Pay via Till */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 mb-4">
              <p className="font-semibold mb-1">Pay via M-Pesa Till</p>
              <div className="flex items-center justify-between bg-white border border-blue-200 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-xs text-gray-500">Till Number</p>
                  <p className="text-xl font-bold tracking-wider text-blue-700">{TILL_NUMBER}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-xs text-gray-500">Amount: <span className="font-semibold text-blue-700">{formatPrice(listing.price)}</span></p>
                  <button
                    type="button"
                    onClick={copyTill}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Till'}
                  </button>
                </div>
              </div>
              <p className="text-xs mt-2">
                After paying, paste the <strong>M-Pesa confirmation message</strong> below and submit. We&apos;ll confirm
                your payment and release the house to you.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number <span className="text-red-500">*</span></label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Area / Location <span className="text-red-500">*</span></label>
                <input type="text" value={area} onChange={(e) => setArea(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Number <span className="text-gray-400">(optional)</span></label>
                <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  M-Pesa Confirmation Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={mpesaMessage}
                  onChange={(e) => setMpesaMessage(e.target.value)}
                  rows={3}
                  placeholder="Paste the M-Pesa confirmation message you received here..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading || !mpesaMessage} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? 'Submitting...' : 'Submit Booking'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-bold mb-1">Booking Request Submitted!</h2>
              <p className="text-sm text-gray-500 mb-4">
                We&apos;ve received your payment details and will confirm it shortly. We&apos;ll contact you via <strong>call</strong> or <strong>WhatsApp</strong> once your house is released.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Contact number</p>
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-blue-500 shrink-0" />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => { setContactPhone(e.target.value); setPhoneChanged(true) }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {phoneChanged && contactPhone !== phone && (
                <p className="text-xs text-amber-600">We&apos;ll use this number to reach you instead.</p>
              )}
              {!phoneChanged && (
                <p className="text-xs text-gray-500">We&apos;ll call or WhatsApp you on this number.</p>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `Hi AseHanta! I've paid the hunting fee for ${listing.title} (${listing.location}) via Till ${TILL_NUMBER}.\n\nName: ${name}\nPhone: ${contactPhone}\nArea: ${area}${idNumber ? `\nID No: ${idNumber}` : ''}${mpesaMessage ? `\n\nM-Pesa Message:\n${mpesaMessage}` : ''}`
              )}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-700 transition-colors">
                <MessageCircle className="w-4 h-4" /> WhatsApp Now
              </a>
              <a href={`tel:${CONTACT_PHONE}`}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition-colors">
                <Phone className="w-4 h-4" /> Call Now
              </a>
            </div>

            <p className="text-xs text-gray-400 text-center mt-4">
              Or wait &mdash; we&apos;ll reach out to you shortly.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
