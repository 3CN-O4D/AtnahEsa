'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  Loader2,
  MessageCircle,
  Receipt,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrice } from '@/lib/utils'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'
import { getWhatsAppLink } from '@/lib/whatsapp'

type SessionBooking = {
  id: string
  listing_id: string
  listing_title: string | null
  listing_location: string | null
  listing_price: number
  phone: string | null
  status: string
  release_status: string
  held_until: string | null
  mpesa_receipt: string | null
  mpesa_message: string | null
  confirmed_at: string | null
  payment_method: string | null
  created_at: string
}

type SessionTransaction = {
  id: string
  status: string
  amount: number
  mpesa_receipt: string | null
  result_desc: string | null
  transaction_request_id: string | null
  created_at: string
}

type SessionListing = {
  id: string
  title: string
  location: string
  price?: number | null
  images: string[] | null
  phone: string | null
}

type Session = {
  booking: SessionBooking
  transaction: SessionTransaction | null
  listing: SessionListing | null
}

function errStr(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  if (!value) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function Countdown({ until }: { until: string }) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    const tick = () => {
      const remaining = new Date(until).getTime() - Date.now()
      if (remaining <= 0) {
        setLabel('View window closed — review due')
        return
      }
      const hours = Math.floor(remaining / 3_600_000)
      const minutes = Math.floor((remaining % 3_600_000) / 60_000)
      const seconds = Math.floor((remaining % 60_000) / 1000)
      setLabel(`${hours}h ${minutes}m ${seconds}s left`)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [until])

  return <span className="tabular-nums">{label}</span>
}

function EscrowRules() {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-xs leading-relaxed text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="h-4 w-4" /> How your escrow works
      </p>
      <ul className="list-disc space-y-1 pl-4">
        <li>Your money is held by AseHanta — not sent to the lister yet.</li>
        <li>You have <strong>24 hours</strong> to view the house and confirm you are happy.</li>
        <li>Changed your mind after viewing? You get <strong>85% back</strong>.</li>
        <li>Fake listing, wrong house or no show? You get <strong>100% back</strong>.</li>
        <li>Keep your receipt — it is proof of payment and of these terms.</li>
      </ul>
    </div>
  )
}

function PaymentPageInner() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params?.id || ''

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [listing, setListing] = useState<SessionListing | null>(null)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [paying, setPaying] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sms, setSms] = useState('')
  const [submittingSms, setSubmittingSms] = useState(false)
  const [smsSubmitted, setSmsSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const mountedRef = useRef(true)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/payments/session/${id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errStr(data.error) || 'Could not load this payment')
    if (!mountedRef.current) return
    setSession(data)
    setListing(data.listing || null)
    if (data.booking?.phone) setPhone(data.booking.phone)
    return data as Session
  }, [id])

  const checkStatus = useCallback(
    async (silent = false) => {
      if (!id || id === 'new') return
      if (!silent) {
        setChecking(true)
        setError('')
      }
      try {
        const res = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (!silent) setError(errStr(data.error) || 'Could not check the payment')
          return
        }
        await loadSession()
        if (data.confirmed) {
          setNotice('Payment confirmed. Your escrow is now open.')
        } else if (data.status === 'Failed' || data.status === 'Cancelled') {
          setError('The M-Pesa request was cancelled or failed. You can try again.')
        }
      } catch (err) {
        if (!silent) setError(errStr(err) || 'Could not check the payment')
      } finally {
        if (!silent && mountedRef.current) setChecking(false)
      }
    },
    [id, loadSession]
  )

  // Initial load: either prepare a new payment or restore an existing one.
  useEffect(() => {
    if (!id) return
    let cancelled = false

    const boot = async () => {
      setLoading(true)
      setError('')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(signInUrl(currentPathWithSearch()))
        return
      }

      if (id === 'new') {
        const listingId = searchParams.get('listing') || ''
        if (!listingId) {
          setError('Missing listing. Go back and choose a house again.')
          setLoading(false)
          return
        }

        // `listings` has no `phone` column (the lister's number lives in
        // `lister_phone` and is never exposed here). Selecting a missing column
        // made PostgREST fail, which surfaced as "no longer available".
        const [{ data: row }, { data: profile }] = await Promise.all([
          supabase
            .from('listings')
            .select('id, title, location, images, price, status')
            .eq('id', listingId)
            .maybeSingle(),
          supabase.from('profiles').select('phone, email').eq('id', user.id).maybeSingle(),
        ])

        if (cancelled) return
        if (!row || row.status !== 'published') {
          setError("This house isn't accepting bookings right now. Pick another house or contact support.")
          setLoading(false)
          return
        }

        setListing({ id: row.id, title: row.title, location: row.location, price: row.price, images: row.images, phone: null })
        setPhone(searchParams.get('phone') || profile?.phone || '')
        setEmail(searchParams.get('email') || user.email || profile?.email || '')
        setLoading(false)
        return
      }

      try {
        await loadSession()
        setLoading(false)
        // Kick off one status check immediately.
        checkStatus(true)
      } catch (err) {
        if (!cancelled) {
          setError(errStr(err) || 'Could not load this payment')
          setLoading(false)
        }
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [id, router, searchParams, loadSession, checkStatus])

  // Poll while the STK push is still pending, then stop.
  useEffect(() => {
    if (!session || id === 'new') return
    const pending = session.booking.status === 'pending' && session.transaction?.status === 'pending'
    if (!pending) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      return
    }

    if (pollingRef.current) return
    let attempts = 0
    pollingRef.current = setInterval(() => {
      attempts += 1
      setRetryCount(attempts)
      if (attempts > 24) {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        return
      }
      checkStatus(true)
    }, 5000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [session?.booking.status, session?.transaction?.status, id, checkStatus])

  const startPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!listing) {
      setError('Missing listing details')
      return
    }
    if (!phone.trim()) {
      setError('Enter the M-Pesa number that will pay')
      return
    }
    if (!email.trim()) {
      setError('We need an email address for your receipt')
      return
    }

    setPaying(true)
    try {
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.id, phone, email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(errStr(data.error) || 'Could not start the payment')
        setPaying(false)
        return
      }

      const bookingId = data.booking_id || data.bookingId
      if (!bookingId) {
        setError('Payment was created but we could not open it. Check My Bookings.')
        setPaying(false)
        return
      }

      // Move from the draft URL to the real payment session.
      router.replace(`/payments/${bookingId}`)
    } catch (err) {
      setError(errStr(err) || 'Could not start the payment')
      setPaying(false)
    }
  }

  const submitSms = async () => {
    if (!session) return
    setSubmittingSms(true)
    setError('')
    try {
      const res = await fetch('/api/payments/manual-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: session.booking.id, mpesa_message: sms }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(errStr(data.error) || 'Could not submit that message')
        setSubmittingSms(false)
        return
      }
      setSmsSubmitted(!data.auto_confirmed)
      setNotice(data.message || 'Your payment is under review.')
      await loadSession()
    } catch (err) {
      setError(errStr(err) || 'Could not submit that message')
    } finally {
      setSubmittingSms(false)
    }
  }

  const copyBooking = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(session.booking.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  const confirmed = useMemo(() => {
    if (!session) return false
    return (
      session.booking.status === 'confirmed' ||
      ['held', 'paid', 'released'].includes(session.booking.release_status)
    )
  }, [session])

  const underReview =
    smsSubmitted ||
    (!confirmed && session?.transaction?.status === 'verifying') ||
    (!confirmed && Boolean(session?.booking.mpesa_message && !session?.booking.mpesa_receipt && session?.transaction?.status !== 'pending'))

  const failed =
    !confirmed &&
    (session?.booking.status === 'cancelled' ||
      session?.transaction?.status === 'failed' ||
      session?.transaction?.status === 'cancelled')

  const whatsappLink = confirmed && session?.listing?.phone
    ? getWhatsAppLink(
        session.listing.phone,
        `Hi, I paid for "${session.listing.title}" on AseHanta (booking ${session.booking.id.slice(0, 8)}). Let's arrange a viewing.`
      )
    : null

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-2/3 rounded-lg bg-gray-200 dark:bg-slate-700" />
          <div className="h-40 rounded-2xl bg-gray-200 dark:bg-slate-700" />
          <div className="h-4 w-1/2 rounded bg-gray-200 dark:bg-slate-700" />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your secure payment…
        </p>
      </div>
    )
  }

  // ---------- New payment: review then send STK push ----------
  if (id === 'new') {
    if (!listing) {
      return (
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{error || 'This house is not available.'}</p>
          <Link href="/listings" className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Browse houses
          </Link>
        </div>
      )
    }

    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
          <ShieldCheck className="h-4 w-4" /> Secure escrow payment
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pay &amp; book</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review the exact amount before we send the M-Pesa request.</p>

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
            <p className="text-xs text-gray-400">You pay exactly this amount. No platform deduction, no hidden KES 1.</p>
          </div>
        </div>

        <form onSubmit={startPayment} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">M-Pesa phone number</label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ''))}
              placeholder="0712345678"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-800 dark:text-white"
              required
            />
            <p className="mt-1 text-xs text-gray-500">The STK push goes to this number.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Receipt email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>

          <EscrowRules />

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={paying}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
            {paying ? 'Sending M-Pesa request…' : `Pay ${formatPrice(listing.price || 0)}`}
          </button>
          <p className="text-center text-xs text-gray-400">
            A prompt will appear on your phone. Enter your M-Pesa PIN to complete the payment.
          </p>
        </form>
      </div>
    )
  }

  // ---------- Existing payment session ----------
  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{error || 'Payment not found.'}</p>
        <Link href="/my-bookings?tab=payments" className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Go to My Bookings
        </Link>
      </div>
    )
  }

  const booking = session.booking
  const amount = Number(booking.listing_price) || 0

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <button
        onClick={() => router.push('/my-bookings?tab=payments')}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> My payments
      </button>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Paying for</p>
              <h1 className="mt-1 font-semibold text-gray-900 dark:text-white">{booking.listing_title || 'House booking'}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{booking.listing_location}</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
              {formatPrice(amount)}
            </span>
          </div>
        </div>

        <div className="p-4">
          {/* Confirmed */}
          {confirmed && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center dark:border-green-800 dark:bg-green-900/20">
                <CheckCircle className="mx-auto h-9 w-9 text-green-600" />
                <h2 className="mt-2 font-semibold text-green-900 dark:text-green-100">Payment confirmed — money in escrow</h2>
                <p className="mt-1 text-xs text-green-800 dark:text-green-200">
                  Receipt {booking.mpesa_receipt || '—'} · {formatPrice(amount)} held by AseHanta.
                </p>
                {booking.held_until && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-200">
                    <Clock className="h-3.5 w-3.5" /> <Countdown until={booking.held_until} />
                  </p>
                )}
              </div>

              <EscrowRules />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <a
                  href={`/api/payments/receipt/${booking.id}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" /> Download receipt
                </a>
                {whatsappLink ? (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp lister
                  </a>
                ) : (
                  <Link
                    href="/my-bookings?tab=payments"
                    className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-700"
                  >
                    <Receipt className="h-4 w-4" /> My bookings
                  </Link>
                )}
              </div>
              <p className="text-center text-xs text-gray-400">
                Booking ref <button onClick={copyBooking} className="underline decoration-dotted">{booking.id.slice(0, 8)}</button>
                {copied ? ' · copied' : ' · tap to copy'}
              </p>
            </div>
          )}

          {/* Under review */}
          {!confirmed && underReview && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-900/20">
                <Clock className="mx-auto h-9 w-9 text-amber-600" />
                <h2 className="mt-2 font-semibold text-amber-900 dark:text-amber-100">Payment under review</h2>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  We received your M-Pesa message and are checking it against PayWave. If it matches, escrow opens
                  automatically; otherwise an admin confirms it. You do not need to pay again.
                </p>
              </div>
              <EscrowRules />
              <Link
                href="/my-bookings?tab=payments"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-700"
              >
                <Receipt className="h-4 w-4" /> Track in My Bookings
              </Link>
            </div>
          )}

          {/* Failed */}
          {!confirmed && !underReview && failed && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
                <AlertTriangle className="mx-auto h-9 w-9 text-red-500" />
                <h2 className="mt-2 font-semibold text-red-900 dark:text-red-100">Payment not confirmed</h2>
                <p className="mt-1 text-xs text-red-800 dark:text-red-200">
                  We have not matched a payment to this booking yet. If M-Pesa charged you, paste the confirmation SMS
                  below — do not start a new booking. An admin will verify it and open escrow.
                </p>
              </div>
              <SmsFallback
                sms={sms}
                setSms={setSms}
                submitting={submittingSms}
                onSubmit={submitSms}
                phone={booking.phone || ''}
                prominent
              />
              <button
                onClick={() => checkStatus(false)}
                disabled={checking}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-700"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {checking ? 'Checking with PayWave…' : 'Check payment again'}
              </button>
              <Link
                href="/my-bookings?tab=payments"
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-700"
              >
                <Receipt className="h-4 w-4" /> Back to My Bookings
              </Link>
            </div>
          )}

          {/* Waiting for the STK push */}
          {!confirmed && !underReview && !failed && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-center dark:border-blue-800 dark:bg-blue-900/20">
                <div className="relative mx-auto h-12 w-12">
                  <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/40" />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Smartphone className="h-6 w-6" />
                  </span>
                </div>
                <h2 className="mt-3 font-semibold text-blue-900 dark:text-blue-100">Check your phone</h2>
                <p className="mt-1 text-xs text-blue-800 dark:text-blue-200">
                  Enter your M-Pesa PIN on the prompt to pay {formatPrice(amount)}. This page updates automatically.
                </p>
                <p className="mt-2 text-[11px] text-blue-700/70 dark:text-blue-300/70">
                  {retryCount > 0 ? `Checked ${retryCount} time${retryCount === 1 ? '' : 's'} — still waiting…` : 'Waiting for confirmation…'}
                </p>
              </div>

              <button
                onClick={() => checkStatus(false)}
                disabled={checking}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {checking ? 'Checking with PayWave…' : "I've paid — check now"}
              </button>

              <EscrowRules />

              <SmsFallback
                sms={sms}
                setSms={setSms}
                submitting={submittingSms}
                onSubmit={submitSms}
                phone={booking.phone || ''}
              />

              <p className="text-center text-xs text-gray-400">
                Booking ref <button onClick={copyBooking} className="underline decoration-dotted">{booking.id.slice(0, 8)}</button>
                {copied ? ' · copied' : ''}
              </p>
            </div>
          )}

          {notice && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">
              {notice}
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SmsFallback({
  sms,
  setSms,
  submitting,
  onSubmit,
  phone,
  prominent = false,
}: {
  sms: string
  setSms: (value: string) => void
  submitting: boolean
  onSubmit: () => void
  phone: string
  prominent?: boolean
}) {
  return (
    <div
      id="sms"
      className={`scroll-mt-6 rounded-xl border p-3 text-sm ${
        prominent
          ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-200 dark:border-amber-700 dark:bg-amber-900/20 dark:ring-amber-800'
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-slate-900/40'
      }`}
    >
      <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
        prominent ? 'text-amber-800 dark:text-amber-200' : 'text-gray-700 dark:text-gray-200'
      }`}>
        <Receipt className="h-3.5 w-3.5" /> Already paid? Submit your M-Pesa SMS
      </p>
      <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
        If {phone || 'your phone'} was charged but this page does not confirm it, paste the confirmation SMS from
        M-Pesa. We check it against PayWave instantly — if it matches, escrow opens right away; otherwise an admin
        verifies it. Do not pay again or start a new booking.
      </p>
      <textarea
        value={sms}
        onChange={(e) => setSms(e.target.value)}
        rows={3}
        placeholder="QGH7X8Y9Z1 Confirmed. Ksh500.00 sent to ASEHANTA INVESTMENTS…"
        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-800 dark:text-white"
      />
      <button
        onClick={onSubmit}
        disabled={submitting || sms.trim().length < 20}
        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50 ${
          prominent ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-900 hover:bg-black dark:bg-white dark:text-gray-900'
        }`}
      >
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
        {submitting ? 'Submitting…' : 'Verify my payment'}
      </button>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" /> Loading payment…
        </div>
      }
    >
      <PaymentPageInner />
    </Suspense>
  )
}
