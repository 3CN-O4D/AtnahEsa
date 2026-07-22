'use client'

import { useState } from 'react'
import { Mail, Phone, MapPin, Send, MessageCircle, Home } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_LOCATION, WHATSAPP_NUMBER } from '@/lib/constants'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [location, setLocation] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, id_number: idNumber, location, message }),
      })

      if (!res.ok) throw new Error('Failed to submit')
      setSuccess(true)
    } catch {
      setError('Failed to send message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Message Sent!</h1>
        <p className="text-gray-600">
          We&apos;ll get back to you as soon as possible.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-4">
        <img src="/images/asehanta-logo.jpeg" alt="AseHanta" className="h-10 w-10 rounded-full object-cover" />
        <div>
          <h1 className="text-2xl font-bold">Contact Us</h1>
          <p className="text-gray-600 text-sm">
            Have a question about a listing, mover, or WiFi package? Fill in the form below.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Full Name" id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Phone Number" id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          <Input label="Email Address" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="ID/Passport Number (required for WiFi)" id="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
          <Input label="Your Location" id="location" value={location} onChange={(e) => setLocation(e.target.value)} required />

          <div className="space-y-1">
            <label htmlFor="message" className="block text-sm font-medium text-gray-700">Message</label>
            <textarea
              id="message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us how we can help..."
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" loading={loading} className="flex-1">
              <Send className="w-4 h-4 mr-1.5" />
              Send Message
            </Button>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
                `Hi AseHanta!\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nID: ${idNumber}\nLocation: ${location}\nMessage: ${message}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-green-400 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-green-600" />
              WhatsApp
            </a>
          </div>
        </form>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold dark:text-white">Other ways to reach us</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-start gap-3 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Mail className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                <span>{CONTACT_EMAIL}</span>
              </a>
              <a href={`tel:${CONTACT_PHONE}`} className="flex items-start gap-3 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Phone className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                <span>{CONTACT_PHONE_DISPLAY}</span>
              </a>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                <MessageCircle className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                <span>WhatsApp</span>
              </a>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-blue-600 shrink-0" />
                <span>{CONTACT_LOCATION}</span>
              </div>
            </div>
          </div>

          <a
            href="/listings"
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Home className="w-5 h-5" />
            </div>
            <div className="text-sm">
              <p className="font-medium">Request a House</p>
              <p className="text-blue-100 text-xs">Browse listings and find your perfect home</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
