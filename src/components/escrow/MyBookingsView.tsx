'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Clock, CheckCircle, AlertTriangle, XCircle, Eye, Home, Star, ThumbsUp, ThumbsDown, Loader2, Phone, MessageCircle, Receipt, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { SkeletonBooking } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import { hasListerRole } from '@/lib/roles'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from '@/lib/constants'
import {
  ISSUE_CATEGORIES,
  ISSUE_TERMS,
  PLEASED_TERMS,
  getIssueCategory,
  parseBookingFeedback,
  parseListerFeedback,
  refundPercentForFeedback,
  serializeBookingFeedback,
  type BookingFeedback,
  type IssueCategory,
  type ListerFeedbackOutcome,
} from '@/lib/booking-feedback'
import {
  canPayerCancel,
  canReportLateAfterAutoApproval,
  deriveBookingState,
  type BookingState,
} from '@/lib/booking-workflow'
import type { Booking, Listing, EscrowHold, HouseBooking } from '@/types'

type BookingWithDetails = Booking & {
  listing: Pick<Listing, 'id' | 'title' | 'images' | 'location' | 'price'>
  escrow_hold: EscrowHold | null
}

type Tab = 'hunter' | 'lister'

function StatusBadge({ release_status }: { release_status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'In Escrow', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
    released: { label: 'Released', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
    refunded: { label: 'Refunded', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
    refund_requested: { label: 'Refund Requested', className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
    rejected: { label: 'Rejected', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  }
  const c = config[release_status] || { label: release_status, className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>
}

function ReleaseBadge({ release_status }: { release_status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
    held: { label: 'In Escrow', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
    paid: { label: 'Paid to Lister', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
    refunded: { label: 'Refunded', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
    refund_requested: { label: 'Refund Requested', className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  }
  const c = config[release_status] || { label: release_status, className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.className}`}>{c.label}</span>
}

/** Human-friendly status derived from the shared booking state machine. */
function WorkflowBadge({ state }: { state: BookingState }) {
  const styles: Record<string, string> = {
    awaiting_payment: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    payment_under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    payment_received_unapplied: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    payment_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    escrow_held: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    awaiting_payout: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    issue_open: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    refund_approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    refund_declined: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    refunded: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[state.phase] || styles.awaiting_payment}`}>
      {state.label}
    </span>
  )
}

/** Feedback can live in `displeased_reason`, or (legacy) in a rating alone. */
function feedbackForBooking(hb: HouseBooking): BookingFeedback | null {
  const parsed = parseBookingFeedback(hb.displeased_reason)
  if (parsed) return parsed
  if (hb.confirmed_at && hb.rating != null) {
    return {
      version: 1,
      outcome: 'pleased',
      category: 'pleased',
      details: '',
      review: '',
      rating: hb.rating,
      contacted_hunter_at: null,
      contacted_lister_at: null,
      admin_note: '',
      decision: null,
      decided_at: null,
    }
  }
  return null
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

function hasRating(rating: number | null | undefined): rating is number {
  return typeof rating === 'number' && rating >= 1 && rating <= 5
}

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']

/** Saved rating + review, shown on the booking after the hunter submits it. */
function FeedbackSummary({ feedback }: { feedback: BookingFeedback }) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-slate-900/40">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Your lister review</span>
        <span className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`h-3 w-3 ${n <= feedback.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />
          ))}
        </span>
      </div>
      {feedback.review ? (
        <p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">&ldquo;{feedback.review}&rdquo;</p>
      ) : null}
    </div>
  )
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
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-950/60 dark:bg-blue-950/20">
      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
        House contact unlocked
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</span>
        {contact.phone ? (
          <>
            <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-800">
              <Phone className="h-3 w-3" /> {contact.phone}
            </a>
            {contact.whatsapp && (
              <a href={contact.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-blue-700 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 dark:text-blue-300">
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">Phone shared by AseHanta support</span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-blue-900 dark:text-blue-300/90">
        No answer, a no-show, or the house is not as advertised? Report it before escrow closes for a refund of up to{' '}
        <strong>100%</strong>, or call AseHanta on{' '}
        <a href={`tel:${CONTACT_PHONE_DISPLAY}`} className="font-semibold underline underline-offset-2">{CONTACT_PHONE_DISPLAY}</a>{' '}
        · <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline underline-offset-2">{CONTACT_EMAIL}</a>{' '}
        · <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">WhatsApp</a>
      </p>
    </div>
  )
}

export type BookingsViewMode = 'bookings' | 'escrow'

export default function MyBookingsView({ mode = 'bookings' }: { mode?: BookingsViewMode }) {
  return (
    <Suspense fallback={<SkeletonBooking />}>
      <MyBookingsInner mode={mode} />
    </Suspense>
  )
}

function MyBookingsInner({ mode }: { mode: BookingsViewMode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEscrowMode = mode === 'escrow'
  // Legacy links (emails, old bookmarks) point at ?tab=payments. House
  // payments now live inside "My Viewings", so map that tab across.
  const requestedTab = searchParams.get('tab')
  const initialTab: Tab = isEscrowMode || requestedTab !== 'lister' ? 'hunter' : 'lister'
  const [profileRole, setProfileRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [listerBookings, setListerBookings] = useState<BookingWithDetails[]>([])
  const [houseBookings, setHouseBookings] = useState<HouseBooking[]>([])
  const [listerHouseBookings, setListerHouseBookings] = useState<HouseBooking[]>([])
  const [housePayments, setHousePayments] = useState<Record<string, { status: string; receipt: string | null }>>({})
  const [acting, setActing] = useState<{ id: string; action: 'confirm' | 'displeased' | 'fake_no_show' } | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [feedbackFor, setFeedbackFor] = useState<{ id: string; outcome: 'pleased' | 'issue' } | null>(null)
  const [fbRating, setFbRating] = useState(0)
  const [fbComment, setFbComment] = useState('')
  const [fbCategory, setFbCategory] = useState<IssueCategory>('not_as_advertised')
  const [fbDetails, setFbDetails] = useState('')
  const [paymentsError, setPaymentsError] = useState('')
  const [paymentsNotice, setPaymentsNotice] = useState('')
  const [expandedListerBooking, setExpandedListerBooking] = useState<string | null>(null)
  const [listerFormFor, setListerFormFor] = useState<string | null>(null)
  const [listerOutcome, setListerOutcome] = useState<ListerFeedbackOutcome>('viewing_confirmed')
  const [listerDetails, setListerDetails] = useState('')
  const [listerSubmitting, setListerSubmitting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Bring the newly opened feedback form into view instead of leaving it
  // stranded below the fold on phones.
  useEffect(() => {
    if (!feedbackFor) return
    const form = document.getElementById(`feedback-${feedbackFor.id}`)
    if (!form) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })
  }, [feedbackFor])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push(signInUrl(currentPathWithSearch())); return }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      setProfileRole(profile?.role || null)

      const { data: myBookings } = await supabase
        .from('bookings')
        .select('*, listing:listings!inner(*), escrow_hold:escrow_holds(*)')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: false })

      if (myBookings) setBookings(myBookings as unknown as BookingWithDetails[])

      if (hasListerRole(profile?.role)) {
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

      // The hunter may have paid while offline, or refreshed before the
      // callback landed. Reconcile any still-pending bookings with PayWave on
      // return so their My Bookings state is correct without extra clicks.
      const pendingIds = (hb as HouseBooking[] | null || [])
        .filter((b) => b.status === 'pending' || b.release_status === 'pending')
        .map((b) => b.id)
        .slice(0, 5)
      if (pendingIds.length > 0) {
        void (async () => {
          try {
            const results = await Promise.all(
              pendingIds.map(async (bookingId) => {
                try {
                  const res = await fetch('/api/payments/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ booking_id: bookingId }),
                  })
                  const json = await res.json().catch(() => ({}))
                  return res.ok && json.confirmed === true
                } catch {
                  return false
                }
              })
            )
            if (!results.some(Boolean)) return

            const { data: refreshed } = await supabase
              .from('house_bookings')
              .select('*')
              .eq('user_id', data.user!.id)
              .order('created_at', { ascending: false })
            if (refreshed) setHouseBookings(refreshed as unknown as HouseBooking[])

            const { data: txs } = await supabase
              .from('transactions')
              .select('status, mpesa_receipt, raw_callback, created_at')
              .filter('raw_callback->>house_booking_id', 'in', `(${pendingIds.join(',')})`)
              .order('created_at', { ascending: false })
            const map: Record<string, { status: string; receipt: string | null }> = {}
            for (const tx of txs || []) {
              const linked = (tx.raw_callback as Record<string, unknown> | null)?.house_booking_id
              if (typeof linked === 'string' && !map[linked]) {
                map[linked] = { status: tx.status, receipt: tx.mpesa_receipt }
              }
            }
            setHousePayments((prev) => ({ ...prev, ...map }))
            setPaymentsNotice('Payment confirmed — your escrow is now open.')
          } catch {
            /* a failed reconciliation leaves the page unchanged */
          }
        })()
      }
    })
  }, [router])

  function openFeedback(hb: HouseBooking, outcome: 'pleased' | 'issue') {
    setFeedbackFor({ id: hb.id, outcome })
    setFbRating(0)
    setFbComment('')
    setFbCategory('not_as_advertised')
    setFbDetails('')
    setPaymentsError('')
    setPaymentsNotice('')
  }

  function closeFeedback() {
    setFeedbackFor(null)
    setFbRating(0)
    setFbComment('')
    setFbDetails('')
  }

  function openListerFeedback(hb: HouseBooking, outcome: ListerFeedbackOutcome) {
    setExpandedListerBooking(null)
    setListerFormFor(hb.id)
    setListerOutcome(outcome)
    setListerDetails('')
    setPaymentsError('')
    setPaymentsNotice('')
  }

  function closeListerFeedback() {
    setListerFormFor(null)
    setListerDetails('')
  }

  async function submitListerFeedback(hb: HouseBooking) {
    if (listerOutcome === 'issue' && listerDetails.trim().length < 5) {
      setPaymentsError('Please describe the problem (at least 5 characters).')
      return
    }
    setListerSubmitting(hb.id)
    setPaymentsError('')
    setPaymentsNotice('')
    try {
      const res = await fetch(`/api/house-bookings/${hb.id}/lister-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: listerOutcome, details: listerDetails.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPaymentsError(data.error || 'Could not save your feedback.')
        return
      }
      if (data.displeased_reason) {
        setListerHouseBookings(prev => prev.map(b => b.id === hb.id ? { ...b, displeased_reason: data.displeased_reason } : b))
      }
      closeListerFeedback()
      setPaymentsNotice(data.message || 'Feedback saved. An admin has been notified.')
    } catch {
      setPaymentsError('Could not save your feedback. Please try again.')
    } finally {
      setListerSubmitting(null)
    }
  }

  async function submitFeedback(hb: HouseBooking) {
    const outcome = feedbackFor?.outcome
    if (!outcome) return
    if (fbRating < 1) { setPaymentsError('Please rate the lister from 1 to 5 stars'); return }
    if (fbComment.trim().length < 3) { setPaymentsError('Please write a short review for the lister'); return }
    if (outcome === 'issue' && !fbDetails.trim()) { setPaymentsError('Please tell us what happened'); return }

    const action = outcome === 'pleased' ? 'confirm' : getIssueCategory(fbCategory).action
    const now = new Date().toISOString()
    const feedback: BookingFeedback = {
      version: 1,
      outcome,
      category: outcome === 'pleased' ? 'pleased' : fbCategory,
      details: outcome === 'issue' ? fbDetails.trim() : '',
      review: fbComment.trim(),
      rating: fbRating,
      contacted_hunter_at: null,
      contacted_lister_at: null,
      admin_note: '',
      decision: null,
      decided_at: null,
    }

    setActing({ id: hb.id, action })
    setPaymentsError('')
    setPaymentsNotice('')
    try {
      const res = await fetch('/api/house-bookings/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          booking_id: hb.id,
          rating: fbRating,
          comment: fbComment.trim(),
          category: fbCategory,
          details: fbDetails.trim(),
          reason: fbDetails.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setPaymentsError(data.error || 'Something went wrong'); return }
      setHouseBookings(prev => prev.map(b => b.id === hb.id ? {
        ...b,
        confirmed_at: now,
        rating: fbRating,
        displeased_reason: serializeBookingFeedback(feedback, hb.displeased_reason),
      } : b))
      closeFeedback()
      setPaymentsNotice(data.message || (outcome === 'pleased'
        ? 'Confirmed. An admin will verify before the lister is paid.'
        : 'Report received. An admin will contact you and the lister.'))
    } finally {
      setActing(null)
    }
  }

  async function cancelBooking(hb: HouseBooking) {
    if (!window.confirm('Cancel this viewing request? No viewing fee will be charged and the house will be available again.')) return
    setCancelling(hb.id)
    setPaymentsError('')
    setPaymentsNotice('')
    try {
      const res = await fetch(`/api/house-bookings/${hb.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by the hunter from My Bookings' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPaymentsError(data.error || 'That booking could not be cancelled.')
        return
      }
      setHouseBookings(prev => prev.map(b => b.id === hb.id ? { ...b, status: 'cancelled' } : b))
      setPaymentsNotice(data.message || 'Booking cancelled. No viewing fee was charged.')
    } catch {
      setPaymentsError('Could not cancel this booking. Please try again.')
    } finally {
      setCancelling(null)
    }
  }

  const stateFor = (hb: HouseBooking): BookingState => {
    const payment = housePayments[hb.id]
    return deriveBookingState(hb as never, payment ? { status: payment.status } : null)
  }

  // The dedicated escrow page is deliberately narrower than My Bookings:
  // unpaid/failed/cancelled requests stay on My Bookings, while every row
  // here represents money that has reached (or left) AseHanta's escrow.
  const escrowPhases = [
    'payment_under_review',
    'payment_received_unapplied',
    'escrow_held',
    'awaiting_payout',
    'issue_open',
    'refund_approved',
    'refund_declined',
    'refunded',
    'paid',
  ]
  const visibleHouseBookings = isEscrowMode
    ? houseBookings.filter((hb) =>
        escrowPhases.includes(stateFor(hb).phase) ||
        !!hb.paid_at ||
        !!hb.refunded_at ||
        !!feedbackForBooking(hb)
      )
    : houseBookings

  if (loading) return <SkeletonBooking />

  const currentBookings = isEscrowMode ? [] : tab === 'hunter' ? bookings : listerBookings
  const showListerTab = !isEscrowMode && hasListerRole(profileRole)
  const escrowStates = visibleHouseBookings.map(stateFor)
  const activeHolds = escrowStates.filter((s) => s.phase === 'escrow_held').length
  const awaitingPayout = escrowStates.filter((s) => s.phase === 'awaiting_payout' || s.phase === 'issue_open').length
  const refundedCount = escrowStates.filter((s) => s.phase === 'refunded' || s.phase === 'refund_approved').length
  const heldTotal = visibleHouseBookings.reduce(
    (total, hb) => total + (stateFor(hb).phase === 'escrow_held' ? Number(hb.listing_price) || 0 : 0),
    0
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isEscrowMode ? 'My Escrow' : 'My Bookings'}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isEscrowMode
              ? 'Track paid viewings, the 24-hour hold, reports, refunds and your lister’s contact in one place.'
              : 'Manage your viewings and the houses people have booked.'}
          </p>
        </div>
        {isEscrowMode && (
          <Link href="/my-bookings" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
            All bookings →
          </Link>
        )}
      </div>

      {isEscrowMode && visibleHouseBookings.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Active holds', value: String(activeHolds) },
            { label: 'Awaiting payout', value: String(awaitingPayout) },
            { label: 'Refunds', value: String(refundedCount) },
            { label: 'Held amount', value: formatPrice(heldTotal) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-slate-800">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {!isEscrowMode && (
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
      )}

      <div className="space-y-4">
        {paymentsNotice && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300 text-sm rounded-lg px-4 py-3">{paymentsNotice}</div>
          )}
          {paymentsError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">{paymentsError}</div>
          )}
        {tab === 'hunter' && visibleHouseBookings.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">
              {isEscrowMode ? 'Paid viewings & escrow' : 'House viewings & payments'}
            </h2>
            {visibleHouseBookings.map((hb) => {
              const payment = housePayments[hb.id]
              const state = deriveBookingState(hb as never, payment ? { status: payment.status } : null)
              const isHeld = state.phase === 'escrow_held'
              const isActing = acting?.id === hb.id
              const feedback = feedbackForBooking(hb)
              // The 24h cron can close an unanswered viewing and queue the
              // payout while the money is still held. The hunter can still
              // report a real problem during that short window.
              const lateReportAvailable = canReportLateAfterAutoApproval(hb as never)
              const awaitingConfirmation = (isHeld && !feedback) || lateReportAvailable
              const refundEstimate = refundPercentForFeedback(feedback)
              const refundOpen = state.phase === 'issue_open'
              const paymentConfirmed = ![
                'awaiting_payment',
                'payment_under_review',
                'payment_received_unapplied',
                'payment_failed',
                'cancelled',
              ].includes(state.phase)
              const paymentUnderReview = state.phase === 'payment_under_review'
              const paymentPending = state.phase === 'awaiting_payment'
              const paymentFailed = state.phase === 'payment_failed'
              const canCancel = canPayerCancel(state) && !cancelling
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
                      <WorkflowBadge state={state} />
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
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-medium">
                            <Clock className="w-3 h-3" /> Payment under review
                          </span>
                        )}
                        {paymentPending && (
                          <>
                            <Link
                              href={`/payments/${hb.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                              <Phone className="w-3 h-3" /> Continue payment
                            </Link>
                            <Link
                              href={`/payments/${hb.id}#sms`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20">
                              <Receipt className="w-3 h-3" /> Already paid? Submit SMS
                            </Link>
                          </>
                        )}
                        {paymentFailed && (
                          <>
                            <Link
                              href={`/payments/${hb.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
                              <Phone className="w-3 h-3" /> Retry payment
                            </Link>
                            <Link
                              href={`/payments/${hb.id}#sms`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20">
                              <Receipt className="w-3 h-3" /> Already paid? Submit SMS
                            </Link>
                          </>
                        )}
                        {paymentConfirmed && (
                          <a
                            href={`/api/payments/receipt/${hb.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <Eye className="w-3 h-3" /> {state.phase === 'refunded' ? 'Download refund receipt' : 'Download receipt'}
                          </a>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => cancelBooking(hb)}
                            disabled={!!cancelling}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                            <XCircle className="w-3 h-3" /> {cancelling === hb.id ? 'Cancelling…' : 'Cancel booking'}
                          </button>
                        )}
                      </div>
                    )}

                    {paymentConfirmed && <ListerContact bookingId={hb.id} />}

                    {isHeld && (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 dark:border-blue-950/60 dark:bg-blue-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Your payment is in escrow
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                          <strong>{formatPrice(hb.listing_price || 0)}</strong> is held by AseHanta
                          {hb.held_until ? <> until <strong>{new Date(hb.held_until).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</strong></> : ' for your 24-hour viewing window'}
                          .Happy with the house? Confirm below to close the viewing and approve the lister&apos;s share. Not happy, no-show, or the house is wrong? Report it below for an <strong>80–100% refund</strong>. If you do nothing, the viewing auto-closes when the timer ends.
                        </p>
                        <p className="mt-1.5 text-[11px] text-blue-700 dark:text-blue-300/80">
                          Need help?{' '}
                          <a href={`tel:${CONTACT_PHONE_DISPLAY}`} className="font-semibold underline underline-offset-2">{CONTACT_PHONE_DISPLAY}</a>
                          {' · '}<a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">WhatsApp</a>
                        </p>
                      </div>
                    )}

                    {state.phase === 'cancelled' && (
                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-slate-900/40">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
                          <XCircle className="w-3.5 h-3.5" /> Booking cancelled — no viewing fee charged
                        </p>
                        <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                          This viewing request is closed. The house is available again and you can request another viewing at any time.
                        </p>
                        <Link href={`/listings/${hb.listing_id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          <Home className="w-3 h-3" /> Book this house again
                        </Link>
                      </div>
                    )}

                    {state.phase === 'payment_received_unapplied' && (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 dark:border-blue-900 dark:bg-blue-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Payment received — being attached to your booking
                        </p>
                        <p className="mt-1 text-[11px] text-blue-800 dark:text-blue-300">
                          M-Pesa shows a successful payment. An admin is verifying the receipt. <strong>Do not pay again.</strong>
                        </p>
                      </div>
                    )}

                    {state.phase === 'awaiting_payout' && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-900 dark:bg-green-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-green-900 dark:text-green-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Deal complete — lister payout approved
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-green-800 dark:text-green-300">
                          {lateReportAvailable
                            ? 'The 24-hour viewing window ended without a report, so the viewing was closed and the lister’s 50% payout was queued. The money is still held until an admin sends and records the M-Pesa transfer.'
                            : 'Thanks for confirming. The viewing is closed, the house is marked taken, and our admins have been notified to send the lister’s 50% share by M-Pesa. The booking will show as paid once the admin records the payment SMS.'}
                        </p>
                        {lateReportAvailable && feedbackFor?.id !== hb.id && (
                          <button
                            type="button"
                            onClick={() => openFeedback(hb, 'issue')}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" /> Something was wrong — report it before payout
                          </button>
                        )}
                      </div>
                    )}

                    {state.phase === 'refund_approved' && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Refund approved — {refundEstimate}%
                        </p>
                        <p className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                          An admin approved your refund for {formatPrice(Math.round((hb.listing_price || 0) * refundEstimate / 100))}. They will send it by M-Pesa and record the receipt; the lister will not be paid.
                        </p>
                      </div>
                    )}

                    {state.phase === 'refund_declined' && (
                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-slate-900/40">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
                          <AlertTriangle className="w-3.5 h-3.5" /> Report reviewed — no refund
                        </p>
                        <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                          An admin reviewed both sides and could not approve the refund. The booking has returned to the payout queue. Contact support if you have new information.
                        </p>
                        <a href={`tel:${CONTACT_PHONE_DISPLAY}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          <Phone className="w-3 h-3" /> Contact support
                        </a>
                      </div>
                    )}

                    {state.phase === 'refunded' && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900 dark:bg-amber-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Refund completed
                        </p>
                        <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                          Your refund was sent by M-Pesa and recorded. Download the refund receipt above, or request another viewing.
                        </p>
                        <Link href={`/listings/${hb.listing_id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          <Home className="w-3 h-3" /> Book again
                        </Link>
                      </div>
                    )}

                    {state.phase === 'paid' && (
                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-900 dark:bg-green-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-green-900 dark:text-green-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Completed — lister paid
                        </p>
                        <p className="mt-1 text-[11px] text-green-800 dark:text-green-300">
                          The viewing is complete and the lister&apos;s payout has been recorded with an M-Pesa receipt.
                        </p>
                        <Link href={`/listings/${hb.listing_id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                          <Home className="w-3 h-3" /> Book another house
                        </Link>
                      </div>
                    )}

                    {awaitingConfirmation && feedbackFor?.id !== hb.id && (
                      <div className="mt-3 border-t dark:border-gray-700 pt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          How did the viewing go? Your answer starts the payout or refund review.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => openFeedback(hb, 'pleased')}
                            disabled={!!acting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50">
                            <ThumbsUp className="w-3.5 h-3.5" /> Confirm - I&apos;m pleased
                          </button>
                          <button
                            onClick={() => openFeedback(hb, 'issue')}
                            disabled={!!acting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                            <ThumbsDown className="w-3.5 h-3.5" /> Not happy
                          </button>
                        </div>
                      </div>
                    )}

                    {feedbackFor?.id === hb.id && (
                      <div id={`feedback-${hb.id}`} className="mt-3 border-t dark:border-gray-700 pt-3 space-y-3">
                        <div className={`rounded-lg border p-3 text-xs leading-relaxed ${
                          feedbackFor.outcome === 'pleased'
                            ? 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200'
                            : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
                        }`}>
                          <p className="font-semibold mb-1">
                            {feedbackFor.outcome === 'pleased' ? 'Before you confirm' : 'How refunds work'}
                          </p>
                          <p>{feedbackFor.outcome === 'pleased' ? PLEASED_TERMS : ISSUE_TERMS}</p>
                        </div>

                        {feedbackFor.outcome === 'issue' && (
                          <div>
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1.5">What happened?</p>
                            <div className="grid gap-1.5">
                              {ISSUE_CATEGORIES.map((option) => (
                                <label
                                  key={option.id}
                                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                                    fbCategory === option.id
                                      ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-900/20'
                                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                                  }`}>
                                  <input
                                    type="radio"
                                    name={`issue-${hb.id}`}
                                    checked={fbCategory === option.id}
                                    onChange={() => setFbCategory(option.id)}
                                    disabled={!!acting}
                                    className="mt-0.5 accent-red-600"
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-semibold text-gray-800 dark:text-gray-100">
                                      {option.label}
                                      <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">· {option.refundPercent}% refund</span>
                                    </span>
                                    <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{option.description}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Rate the lister</span>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(n => (
                                <button
                                  key={`${n}-${fbRating}`}
                                  type="button"
                                  onClick={() => setFbRating(n)}
                                  disabled={!!acting}
                                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                                  className="disabled:opacity-50 transition-transform duration-150 hover:scale-125 active:scale-90">
                                  <Star className={`w-5 h-5 transition-colors duration-200 ${
                                    n <= fbRating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'
                                  } ${n <= fbRating ? 'animate-starPop' : ''}`} style={{ animationDelay: `${(n - 1) * 40}ms` }} />
                                </button>
                              ))}
                            </div>
                            {fbRating > 0 && (
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                {RATING_LABELS[fbRating - 1]} · {fbRating}/5
                              </span>
                            )}
                          </div>
                        </div>

                        <label className="block">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            Your review of the lister
                          </span>
                          <textarea
                            value={fbComment}
                            onChange={(e) => setFbComment(e.target.value)}
                            disabled={!!acting}
                            placeholder="Was the lister reachable, honest and punctual? This review appears on their profile."
                            className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                          />
                        </label>

                        {feedbackFor.outcome === 'issue' && (
                          <label className="block">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                              Tell us exactly what happened
                            </span>
                            <textarea
                              value={fbDetails}
                              onChange={(e) => setFbDetails(e.target.value)}
                              disabled={!!acting}
                              placeholder="Share dates, what the lister said, and anything an admin should check."
                              className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={3}
                            />
                          </label>
                        )}

                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1">
                          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                          {feedbackFor.outcome === 'pleased'
                            ? 'Confirming closes the viewing and approves the lister’s 50% payout. An admin sends it by M-Pesa and records the SMS — the booking is not marked paid until then.'
                            : `Estimated refund: ${getIssueCategory(fbCategory).refundPercent}% after review. An admin contacts both you and the lister before any money moves.`}
                        </p>

                        <div className="flex gap-2">
                          <button
                            onClick={() => submitFeedback(hb)}
                            disabled={!!acting}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50 ${
                              feedbackFor.outcome === 'pleased'
                                ? 'bg-blue-700 hover:bg-blue-800'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}>
                            {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : feedbackFor.outcome === 'pleased' ? <ThumbsUp className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            {feedbackFor.outcome === 'pleased' ? 'Confirm success & release payout' : 'Submit report'}
                          </button>
                          <button
                            onClick={closeFeedback}
                            disabled={!!acting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50">
                            Close
                          </button>
                        </div>
                      </div>
                    )}

                    {feedback && feedback.outcome === 'pleased' && hasRating(feedback.rating) && feedbackFor?.id !== hb.id && (
                      <FeedbackSummary feedback={feedback} />
                    )}

                    {refundOpen && feedbackFor?.id !== hb.id && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                          <Clock className="w-3.5 h-3.5" /> Under review — an admin will contact you and the lister
                        </p>
                        <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                          {feedback ? getIssueCategory(feedback.category).label : 'Issue reported'}
                          {refundEstimate > 0 ? ` · ${refundEstimate}% refund requested` : ''}. No money moves until both parties have been reached.
                        </p>
                      </div>
                    )}

                    {feedback && feedback.outcome === 'issue' && feedbackFor?.id !== hb.id && hasRating(feedback.rating) && (
                      <FeedbackSummary feedback={feedback} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {(isEscrowMode
          ? visibleHouseBookings.length === 0
          : currentBookings.length === 0 && (tab !== 'hunter' || houseBookings.length === 0) && (tab !== 'lister' || listerHouseBookings.length === 0)) ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-1">
            {isEscrowMode ? 'No paid escrow yet' : 'No bookings yet'}
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            {isEscrowMode
              ? 'Once your payment is confirmed, the viewing, refund window and lister contact will appear here.'
              : tab === 'hunter' ? 'Browse listings and book a viewing to get started.' : 'No one has booked or paid on your listings yet.'}
          </p>
          {tab === 'hunter' && (
            <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">Browse Listings</Link>
          )}
          {isEscrowMode && (
            <Link href="/my-bookings" className="text-sm text-blue-600 hover:underline dark:text-blue-400">View all bookings</Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!isEscrowMode && tab === 'lister' && listerHouseBookings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300">House payments on your listings</h2>
              {listerHouseBookings.map((hb) => {
                const listerState = deriveBookingState(hb as never, null)
                const listerFeedback = parseListerFeedback(hb.displeased_reason)
                const paidForLister = [
                  'escrow_held', 'awaiting_payout', 'issue_open', 'refund_approved',
                  'refund_declined', 'refunded', 'paid',
                ].includes(listerState.phase) || !!hb.paid_at
                const detailsOpen = expandedListerBooking === hb.id
                const submitting = listerSubmitting === hb.id
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
                      {hb.release_status === 'held' && hb.held_until && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> <Countdown held_until={hb.held_until} /></span>
                      )}
                    </div>
                    {hb.phone && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500">Hunter:</span>
                        <a href={`tel:${hb.phone}`} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {hb.phone}
                        </a>
                        <a
                          href={`https://wa.me/${hb.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800"
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

                    {paidForLister && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t dark:border-gray-700 pt-3">
                        <a
                          href={`/api/payments/receipt/${hb.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          <Download className="w-3.5 h-3.5" /> {hb.release_status === 'refunded' ? 'Download refund receipt' : 'Download receipt'}
                        </a>
                        <button
                          type="button"
                          onClick={() => setExpandedListerBooking(detailsOpen ? null : hb.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          {detailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {detailsOpen ? 'Hide details' : 'View details'}
                        </button>
                        <a
                          href={`tel:${CONTACT_PHONE_DISPLAY}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                        >
                          <Phone className="w-3.5 h-3.5" /> Contact support
                        </a>
                        {!listerFeedback && (
                          <>
                            <button
                              type="button"
                              onClick={() => openListerFeedback(hb, 'viewing_confirmed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" /> Confirm viewing
                            </button>
                            <button
                              type="button"
                              onClick={() => openListerFeedback(hb, 'issue')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" /> Report a problem
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {listerFeedback && (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 dark:border-blue-950/60 dark:bg-blue-950/20">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {listerFeedback.outcome === 'viewing_confirmed' ? 'You confirmed this viewing' : 'Your report is with our team'}
                          <span className="font-normal text-blue-700 dark:text-blue-300/80">
                            · {new Date(listerFeedback.submitted_at).toLocaleDateString()}
                          </span>
                        </p>
                        {listerFeedback.details && (
                          <p className="mt-1 text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">{listerFeedback.details}</p>
                        )}
                      </div>
                    )}

                    {detailsOpen && (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs dark:border-gray-700 dark:bg-slate-900/40">
                        <p><span className="text-gray-500">Status: </span><span className="font-medium text-gray-800 dark:text-gray-100">{listerState.label}</span></p>
                        <p><span className="text-gray-500">Amount: </span><span className="font-medium text-gray-800 dark:text-gray-100">{formatPrice(hb.listing_price || 0)}</span></p>
                        <p><span className="text-gray-500">Hunter: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.name || '—'}</span></p>
                        <p><span className="text-gray-500">Phone: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.phone || '—'}</span></p>
                        <p><span className="text-gray-500">Email: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.email || '—'}</span></p>
                        <p><span className="text-gray-500">Receipt: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.mpesa_receipt || '—'}</span></p>
                        <p><span className="text-gray-500">Paid: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.paid_at ? new Date(hb.paid_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : '—'}</span></p>
                        <p><span className="text-gray-500">Hold ends: </span><span className="font-medium text-gray-800 dark:text-gray-100">{hb.held_until ? new Date(hb.held_until).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : '—'}</span></p>
                      </div>
                    )}

                    {listerFormFor === hb.id && (
                      <div id={`lister-feedback-${hb.id}`} className="mt-3 border-t dark:border-gray-700 pt-3 space-y-2">
                        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                          {listerOutcome === 'viewing_confirmed'
                            ? 'Confirm that the viewing took place. An admin still verifies and records the M-Pesa payout before you are paid.'
                            : 'Tell us what went wrong. An admin will contact both sides. Your report does not move money by itself.'}
                        </p>
                        {listerOutcome === 'issue' && (
                          <textarea
                            value={listerDetails}
                            onChange={(e) => setListerDetails(e.target.value)}
                            rows={3}
                            placeholder="What happened? Include dates and anything an admin should check."
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => submitListerFeedback(hb)}
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                          >
                            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : listerOutcome === 'issue' ? <ThumbsDown className="w-3.5 h-3.5" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                            {submitting ? 'Saving…' : listerOutcome === 'issue' ? 'Submit report' : 'Confirm viewing'}
                          </button>
                          <button
                            type="button"
                            onClick={closeListerFeedback}
                            disabled={submitting}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                          >
                            Close
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
          {currentBookings.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex gap-4 p-4">
                <div className="relative w-24 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  <Image src={b.listing.images?.[0] || '/placeholder.jpg'} alt="" fill sizes="96px" className="object-cover" />
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
                  {b.escrow_hold?.status === 'released' && <><CheckCircle className="w-3 h-3 text-blue-600" /> Funds released</>}
                  {b.escrow_hold?.status === 'refunded' && <><XCircle className="w-3 h-3 text-amber-500" /> Refunded {b.refund_amount ? `(${formatPrice(b.refund_amount)})` : ''}</>}
                </div>
                <Link href={`/booking/${b.id}`} className="text-xs text-blue-600 hover:underline font-medium dark:text-blue-400">
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
