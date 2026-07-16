'use client'

import { useState } from 'react'
import { X, MessageCircle, Phone, Check } from 'lucide-react'
import { WHATSAPP_NUMBER, CONTACT_PHONE } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import type { WifiPackage } from '@/types'

interface WifiBookingModalProps {
  pkg: WifiPackage
  onClose: () => void
}

export default function WifiBookingModal({ pkg, onClose }: WifiBookingModalProps) {
  const [step, setStep] = useState<'form' | 'choice'>('form')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [area, setArea] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      setStep('choice')
    } catch {
      setError('Something went wrong')
    } finally { setLoading(false) }
  }

  const waMsg = `Hi AseHanta! I'm interested in the ${pkg.name} (${pkg.speed}) at ${formatPrice(pkg.price)}/month.%0A%0AName: ${name}%0APhone: ${phone}%0AArea: ${area}${idNumber ? `%0AID No: ${idNumber}` : ''}`

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>

        {step === 'form' ? (
          <>
            <h2 className="text-lg font-bold mb-1">{pkg.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{pkg.speed} — {formatPrice(pkg.price)}/month</p>

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
              <p className="text-sm text-gray-500 mb-6">How would you like to proceed?</p>
            </div>

            <div className="space-y-3">
              <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-green-800">Book via WhatsApp</p>
                  <p className="text-xs text-green-600">Chat with us now</p>
                </div>
              </a>

              <a href={`tel:${CONTACT_PHONE}`}
                className="flex items-center gap-3 w-full bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition-colors">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-blue-800">Book via Call</p>
                  <p className="text-xs text-blue-600">{CONTACT_PHONE}</p>
                </div>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
