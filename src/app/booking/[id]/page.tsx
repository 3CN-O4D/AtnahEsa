'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { signInUrl } from '@/lib/auth-redirect'
import type { Listing } from '@/types'

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data || data.status !== 'published') {
          router.push('/')
          return
        }
        setListing(data as Listing)
      })

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) return
      if (!user) {
        router.push(signInUrl(`/booking/${id}`))
        return
      }
      setUserId(user.id)
      setEmail(user.email || '')

      const { data: profile } = await supabase
        .from('profiles')
        .select('phone, email')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (profile?.phone) setPhone(profile.phone)
      if (profile?.email) setEmail(profile.email)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [id, router])

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!listing) {
      setError('House not found')
      return
    }
    if (userId && listing.uploader_id === userId) {
      setError('You cannot book your own listing')
      return
    }
    if (!phone.trim()) {
      setError('Enter your M-Pesa phone number')
      return
    }

    const digits = phone.replace(/\D/g, '')
    if (!(digits.length >= 9 && digits.length <= 12)) {
      setError('Enter a valid Kenyan phone number, e.g. 0712345678')
      return
    }

    router.push(
      `/payments/new?listing=${encodeURIComponent(listing.id)}&phone=${encodeURIComponent(phone)}${
        email ? `&email=${encodeURIComponent(email)}` : ''
      }`
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!listing) return null

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
        <ShieldCheck className="h-4 w-4" /> Secure escrow booking
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pay &amp; book</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Step 1 of 2 — confirm your M-Pesa number.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        {listing.images?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0]} alt="" className="h-40 w-full object-cover" />
        )}
        <div className="space-y-3 p-4">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{listing.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{listing.location}</p>
          </div>
          <div className="flex items-end justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Hunting fee (escrow)</span>
            <span className="text-2xl font-bold text-blue-600">{formatPrice(listing.price || 0)}</span>
          </div>
          <p className="text-xs text-gray-400">Exact amount. No deductions, no hidden KES 1.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Your money goes into <strong>escrow</strong> for <strong>24 hours</strong>. Happy with the house? Confirm
            and the lister gets paid. Not happy? 85% back. Fake listing? 100% back.
          </span>
        </p>
      </div>

      <form onSubmit={handleContinue} className="mt-5 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            M-Pesa phone number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
            placeholder="0712345678"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-800 dark:text-white"
            maxLength={13}
            required
          />
          <p className="mt-1 text-xs text-gray-500">You can edit this before paying on the next screen.</p>
        </div>

        {email && (
          <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Smartphone className="h-3.5 w-3.5" /> Receipt will be emailed to {email}
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
        >
          <Smartphone className="h-4 w-4" /> Continue to payment
        </button>
        <p className="text-center text-xs text-gray-400">
          You will review the exact amount on the next step before the M-Pesa request is sent.
        </p>
      </form>
    </div>
  )
}
