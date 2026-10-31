'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Clock, CheckCircle, AlertTriangle, XCircle, Eye, Home, Star, ThumbsUp, ThumbsDown, Loader2, Phone, MessageCircle } from 'lucide-react'
import { SkeletonBooking } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from '@/lib/constants'
import type { Booking, Listing, EscrowHold, HouseBooking } from '@/types'

type BookingWithDetails = Booking & {
  listing: Pick<Listing, 'id' | 'title' | 'images' | 'location' | 'price'>
  escrow_hold: EscrowHold | null
}

type Tab = 'hunter' | 'lister'

function StatusBadge({ release_status }: { release_status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'In Escrow', className: 'bg-blue-100 text-blue-700' },
    released: { label: 'Released', className: 'bg-green-100 text-green-700' },
    refunded: { label: 'Refunded', className: 'bg-amber-100 text-amber-700' },
    refund_requested: { label: 'Refund Requested', className: 'bg-red-100 text-red-700' },
    rejected: { label: 'Rejected', className: 'bg-gray-100 text-gray-600' },
  }
  const c = config[release_status] || { label: release_status, className: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>
}

function ReleaseBadge({ release_status }: { release_status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
    held: { label: 'In Escrow', className: 'bg-blue-100 text-blue-700' },
    paid: { label: 'Paid to Lister', className: 'bg-green-100 text-green-700' },
    refunded: { label: 'Refunded', className: 'bg-amber-100 text-amber-700' },
    refund_requested: { label: 'Refund Requested', className: 'bg-red-100 text-red-700' },
  }
  const c = config[release_status] || { label: release_status, className: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>
}

function Countdown({ held_until }: { held_until: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const update = () => {
      const diff = new Date(held_until).getTime() - Date.now()
      if (diff <= 0) { setText('Ready'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setText(`${h}h ${m}m`)
    }
    update()
    const i = setInterval(update, 30000)
    return () => clearInterval(i)
  }, [held_until])
  return <span className="text-xs text-gray-500">{text}</span>
}

type ListerContactInfo = {
  name: string
  phone: string | null
  whatsapp: string | null
  listing?: { title: string; location: string; description: string }
}

/**
 * Lister contact details, fetched only for a confirmed (escrowed) booking.
 * The server refuses to release them before payment.
 */
function ListerContact({ bookingId }: { bookingId: string }) {
  const [contact, setContact] = useState<ListerContactInfo | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/house-bookings/${bookingId}/contact`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('locked'))))
      .then((data: ListerContactInfo) => {
        if (!cancelled) setContact(data)
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [bookingId])

  if (unavailable) return null

  if (!contact) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-slate-800/60 dark:text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Unlocking the lister&apos;s contact…
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        House contact unlocked
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</span>
        {contact.phone ? (
          <>
            <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
              <Phone className="h-3 w-3" /> {contact.phone}
            </a>
            {contact.whatsapp && (
              <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300">
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Phone shared by AseHanta support</span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300/90">
        No answer, a no-show, or the house is not as advertised? Report it before escrow closes for a{' '}
        <strong>100% refund</strong>, or call AseHanta on{' '}
        <a href={`tel:${CONTACT_PHONE_DISPLAY}`} className="font-semibold underline underline-offset-2">{CONTACT_PHONE_DISPLAY}</a>{' '}
        · <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-2">{CONTACT_EMAIL}</a>{' '}
        · <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">WhatsApp</a>
      </p>
    </div>
  )
}

export default function MyBookingsPage() {
  return (
    <Suspense fallback={<SkeletonBooking />}>
      <MyBookingsInner />
    </Suspense>
  )
}

function MyBookingsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Legacy links (emails, old bookmarks) point at ?tab=payments. House
  // payments now live inside "My Viewings", so map that tab across.
  const requestedTab = searchParams.get('tab')
  const initialTab: Tab = requestedTab === 'lister' ? 'lister' : 'hunter'
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [listerBookings, setListerBookings] = useState<BookingWithDetails[]>([])
  const [houseBookings, setHouseBookings] = useState<HouseBooking[]>([])
  const [listerHouseBookings, setListerHouseBookings] = useState<HouseBooking[]>([])
  const [housePayments, setHousePayments] = useState<Record<string, { status: string; receipt: string | null }>>({})
  const [acting, setActing] = useState<{ id: string; action: 'confirm' | 'displeased' } | null>(null)
  const [displeasedFor, setDispleasedFor] = useState<string | null>(null)
  const [displeasedReason, setDispleasedReason] = useState('')
  const [displeasedRating, setDispleasedRating] = useState(0)
  const [paymentsError, setPaymentsError] = useState('')
  const [paymentsNotice, setPaymentsNotice] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push(signInUrl(currentPathWithSearch())); return }
      setUser(data.user)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      setProfileRole(profile?.role || null)

      const { data: myBookings } = await supabase
        .from('bookings')
        .select('*, listing:listings!inner(*), escrow_hold:escrow_holds(*)')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })

      if (myBookings) setBookings(myBookings as unknown as BookingWithDetails[])

      if (profile?.role === 'lister' || profile?.role === 'admin') {
        const { data: listings } = await supabase
          .from('listings')
          .select('id')
          .eq('uploader_id', data.user.id)

        if (listings && listings.length > 0) {
          const listingIds = listings.map(l => l.id)
          const { data: lb } = await supabase
            .from('bookings')
            .select('*, listing:listings!inner(*), escrow_hold:escrow_holds(*)')
            .in('listing_id', listingIds)
            .order('created_at', { ascending: false })
          if (lb) setListerBookings(lb as unknown as BookingWithDetails[])

          const { data: lhb } = await supabase
            .from('house_bookings')
            .select('*')
            .in('listing_id', listingIds)
            .order('created_at', { ascending: false })
          if (lhb) setListerHouseBookings(lhb as unknown as HouseBooking[])
        }
      }
      const { data: hb } = await supabase
        .from('house_bookings')
        .select('*')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })
      if (hb) {
        setHouseBookings(hb as unknown as HouseBooking[])

        const bookingIds = (hb as Array<{ id: string }>).map((b) => b.id)
        if (bookingIds.length > 0) {
          const { data: txs } = await supabase
            .from('transactions')
            .select('status, mpesa_receipt, raw_callback, created_at')
            .filter('raw_callback->>house_booking_id', 'in', `(${bookingIds.join(',')})`)
            .order('created_at', { ascending: false })

          const map: Record<string, { status: string; receipt: string | null }> = {}
          for (const tx of txs || []) {
            const linked = (tx.raw_callback as Record<string, unknown> | null)?.house_booking_id
            if (typeof linked === 'string' && !map[linked]) {
              map[linked] = { status: tx.status, receipt: tx.mpesa_receipt }
            }
          }
          setHousePayments(map)
        }
      }
      setLoading(false)
    })
  }, [router])

  async function handleConfirm(hb: HouseBooking) {
    setActing({ id: hb.id, action: 'confirm' })
    setPaymentsError('')
    setPaymentsNotice('')
    try {
      const res = await fetch('/api/house-bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', booking_id: hb.id }),
      })
      const data = await res.json()
      if (!res.ok) { setPaymentsError(data.error || 'Something went wrong'); return }
      setHouseBookings(prev => prev.map(b => b.id === hb.id ? { ...b, confirmed_at: new Date().toISOString(), rating: 5 } : b))
    } finally {
      setActing(null)
    }
  }

  async function handleDispleased(hb: HouseBooking) {
    if (!displeasedReason.trim()) { setPaymentsError('Please tell us what went wrong'); return }
    if (displeasedRating < 1) { setPaymentsError('Please rate your experience'); return }
    setActing({ id: hb.id, action: 'displeased' })
    setPaymentsError('')
    setPaymentsNotice('')
    try {
      const res = await fetch('/api/house-bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'displeased',
          booking_id: hb.id,
          reason: displeasedReason.trim(),
          rating: displeasedRating,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setPaymentsError(data.error || 'Something went wrong'); return }
      setHouseBookings(prev => prev.map(b => b.id === hb.id ? { ...b, release_status: 'refund_requested', displeased_reason: displeasedReason, rating: displeasedRating } : b))
      setDispleasedFor(null)
      setDispleasedReason('')
      setDispleasedRating(0)
      setPaymentsNotice(data.message || 'Refund requested. Our team will process it within 24 hours.')
    } finally {
      setActing(null)
    }
  }

  if (loading) return <SkeletonBooking />

  const currentBookings = tab === 'hunter' ? bookings : listerBookings
  const showListerTab = profileRole === 'lister' || profileRole === 'admin'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">My Bookings</h1>

      <div className="flex border rounded-lg mb-6 overflow-hidden">
        <button onClick={() => setTab('hunter')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${tab === 'hunter' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
          <Eye className="w-4 h-4 inline mr-1.5" /> My Viewings
        </button>
        {showListerTab && (
          <button onClick={() => setTab('lister')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${tab === 'lister' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <Home className="w-4 h-4 inline mr-1.5" /> Bookings on My Houses
          </button>
        )}

      </div>

      <div className="space-y-4">
        {paymentsNotice && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm rounded-lg px-4 py-3">{paymentsNotice}</div>
          )}
          {paymentsError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">{paymentsError}</div>
          )}
        {tab === 'hunter' && houseBookings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">House viewings &amp; payments</h2>
            {houseBookings.map((hb) => {
              const isHeld = hb.release_status === 'held'
              const isActing = acting?.id === hb.id
              const payment = housePayments[hb.id]
              const paymentConfirmed = hb.status === 'confirmed' || isHeld || hb.release_status === 'paid'
              const paymentUnderReview = !paymentConfirmed && payment?.status === 'verifying'
              const paymentPending = !paymentConfirmed && !paymentUnderReview && payment?.status === 'pending'
              const paymentFailed =
                !paymentConfirmed && !paymentUnderReview && (payment?.status === 'failed' || hb.status === 'cancelled')
              return (
                <div key={hb.id} className="bg-white dark:bg-slate-800 border dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/listings/${hb.listing_id}`} className="font-semibold text-sm hover:text-blue-600 transition-colors line-clamp-1">
                          {hb.listing_title || 'House'}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">{hb.listing_location}</p>
                      </div>
                      <ReleaseBadge release_status={hb.release_status || 'pending'} />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{formatPrice(hb.listing_price || 0)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">{hb.payment_method || 'payment'}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {hb.created_at ? new Date(hb.created_at).toLocaleDateString() : '—'}</span>
                      {isHeld && hb.held_until && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> <Countdown held_until={hb.held_until} /></span>
                      )}
                    </div>

                    {(paymentUnderReview || paymentPending || paymentFailed || paymentConfirmed) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {paymentUnderReview && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                            <Clock className="w-3 h-3" /> Payment under review
                          </span>
                        )}
                        {paymentPending && (
                          <Link
                            href={`/payments/${hb.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                            <Phone className="w-3 h-3" /> Continue payment
                          </Link>
                        )}
                        {paymentFailed && (
                          <Link
                            href={`/payments/new?listing=${hb.listing_id}&phone=${encodeURIComponent(hb.phone || '')}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700">
                            <AlertTriangle className="w-3 h-3" /> Payment failed — try again
                          </Link>
                        )}
                        {paymentConfirmed && (
                          <a
                            href={`/api/payments/receipt/${hb.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <Eye className="w-3 h-3" /> Download receipt
                          </a>
                        )}
                      </div>
                    )}

                    {paymentConfirmed && <ListerContact bookingId={hb.id} />}

                    {isHeld && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => handleConfirm(hb)}
                          disabled={!!acting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                          {isActing && acting?.action === 'confirm' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                          Confirm - I&apos;m pleased
                        </button>
                        <button
                          onClick={() => { setDispleasedFor(hb.id); setPaymentsError('') }}
                          disabled={!!acting}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                          <ThumbsDown className="w-3.5 h-3.5" /> Not happy
                        </button>
                      </div>
                    )}
                    {displeasedFor === hb.id && (
                      <div className="mt-3 border-t dark:border-gray-700 pt-3">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Rate:</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button key={n} onClick={() => setDispleasedRating(n)} disabled={!!acting} className="disabled:opacity-50">
                                <Star className={`w-5 h-5 ${n <= displeasedRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={displeasedReason}
                          onChange={(e) => setDispleasedReason(e.target.value)}
                          disabled={!!acting}
                          placeholder="Tell us what went wrong..."
                          className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> 85% of the fee will be refunded to you and the lister gets nothing.
                        </p>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleDispleased(hb)}
                            disabled={!!acting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                            {isActing && acting?.action === 'displeased' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Submit
                          </button>
                          <button
                            onClick={() => { setDispleasedFor(null); setDispleasedReason(''); setDispleasedRating(0) }}
                            disabled={!!acting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {currentBookings.length === 0 && (tab !== 'hunter' || houseBookings.length === 0) && (tab !== 'lister' || listerHouseBookings.length === 0) ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 mb-1">No bookings yet</h2>
          <p className="text-sm text-gray-400 mb-4">{tab === 'hunter' ? 'Browse listings and book a viewing to get started.' : 'No one has booked or paid on your listings yet.'}</p>
          {tab === 'hunter' && (
            <Link href="/" className="text-sm text-blue-600 hover:underline">Browse Listings</Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {tab === 'lister' && listerHouseBookings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">House payments on your listings</h2>
              {listerHouseBookings.map((hb) => (
                <div key={hb.id} className="bg-white dark:bg-slate-800 border dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/listings/${hb.listing_id}`} className="font-semibold text-sm hover:text-blue-600 transition-colors line-clamp-1">
                          {hb.listing_title || 'House'}
                        </Link>
                        <p className="text-xs text-gray-500 mt-0.5">{hb.listing_location}</p>
                      </div>
                      <ReleaseBadge release_status={hb.release_status || 'pending'} />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{formatPrice(hb.listing_price || 0)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">{hb.payment_method || 'payment'}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {hb.created_at ? new Date(hb.created_at).toLocaleDateString() : '—'}</span>
                      {hb.release_status === 'held' && hb.held_until && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> <Countdown held_until={hb.held_until} /></span>
                      )}
                    </div>
                    {hb.phone && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Hunter:</span>
                        <a href={`tel:${hb.phone}`} className="text-xs font-medium text-blue-600 hover:underline">
                          {hb.phone}
                        </a>
                        <a
                          href={`https://wa.me/${hb.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </a>
                        <a
                          href={`tel:${hb.phone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                        >
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {currentBookings.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex gap-4 p-4">
                <div className="w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  <img src={b.listing.images?.[0] || '/placeholder.jpg'} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/booking/${b.id}`} className="font-semibold text-sm hover:text-blue-600 transition-colors line-clamp-1">
                        {b.listing.title}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{b.listing.location}</p>
                    </div>
                    <StatusBadge release_status={b.release_status || 'pending'} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{formatPrice(b.amount)}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(b.created_at).toLocaleDateString()}</span>
                    {b.escrow_hold && b.escrow_hold.status === 'held' && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> <Countdown held_until={b.escrow_hold.held_until} /></span>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {b.escrow_hold?.status === 'held' && <><CheckCircle className="w-3 h-3 text-blue-500" /> Escrow active</>}
                  {b.escrow_hold?.status === 'released' && <><CheckCircle className="w-3 h-3 text-green-500" /> Funds released</>}
                  {b.escrow_hold?.status === 'refunded' && <><XCircle className="w-3 h-3 text-amber-500" /> Refunded {b.refund_amount ? `(${formatPrice(b.refund_amount)})` : ''}</>}
                </div>
                <Link href={`/booking/${b.id}`} className="text-xs text-blue-600 hover:underline font-medium">
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
