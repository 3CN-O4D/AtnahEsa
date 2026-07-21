'use client'

import { useState } from 'react'
import { X, MessageCircle, Phone, Check, PhoneOff } from 'lucide-react'
import { WHATSAPP_NUMBER, CONTACT_PHONE } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import type { WifiPackage } from '@/types'

interface WifiBookingModalProps {
  pkg: WifiPackage
  onClose: () => void
}

export default function WifiBookingModal({ pkg, onClose }: WifiBookingModalProps) {
  const [step, setStep] = useState<'form' | 'submitted'>('form')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [phoneChanged, setPhoneChanged] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !phone || !area) { setError('Fill in all required fields'); return }
    setLoading(true); setError('')

    try {
      const res = await fetch('/api/wifi/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: pkg.id,
          package_name: pkg.name,
          package_speed: pkg.speed,
          package_price: pkg.price,
          name, phone, area, id_number: idNumber,
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
            <h2 className="text-lg font-bold mb-1">{pkg.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{pkg.speed} &mdash; {formatPrice(pkg.price)}/month</p>

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

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Submitting...' : 'Submit'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <h2 className="text-lg font-bold mb-1">Request Submitted!</h2>
              <p className="text-sm text-gray-500 mb-4">
                We&apos;ll contact you via <strong>call</strong> or <strong>WhatsApp</strong> to confirm your booking.
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
                `Hi AseHanta! I'm interested in the ${pkg.name} (${pkg.speed}) at ${formatPrice(pkg.price)}/month.\n\nName: ${name}\nPhone: ${contactPhone}\nArea: ${area}${idNumber ? `\nID No: ${idNumber}` : ''}`
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
