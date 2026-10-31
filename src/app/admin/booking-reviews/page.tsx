'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Loader2,
  MessageSquareText,
  Phone,
  Receipt,
  RefreshCw,
  Send,
  Star,
  ThumbsDown,
  ThumbsUp,
  Wallet,
  XCircle,
} from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import {
  getIssueCategory,
  type BookingFeedback,
} from '@/lib/booking-feedback'
import type { HouseBooking } from '@/types'

type ReviewRow = HouseBooking & {
  feedback: BookingFeedback
  lister_name: string | null
  lister_phone: string | null
  payout_amount: number
  refund_percent: number
  refund_amount: number
  issue_label: string
  payment_status: string | null
  payment_receipt: string | null
  payment_message: string | null
  payment_result: string | null
  transaction_id: string | null
}

type Data = {
  pending_payouts: ReviewRow[]
  refund_requests: ReviewRow[]
  payment_claims: ReviewRow[]
  awaiting_confirmation: ReviewRow[]
  resolved: ReviewRow[]
  counts: {
    pending_payouts: number
    refund_requests: number
    payment_claims: number
    awaiting_confirmation: number
  }
}

type Tab = 'payments' | 'payouts' | 'refunds' | 'waiting' | 'resolved'

const EMPTY: Data = {
  pending_payouts: [],
  refund_requests: [],
  payment_claims: [],
  awaiting_confirmation: [],
  resolved: [],
  counts: { pending_payouts: 0, refund_requests: 0, payment_claims: 0, awaiting_confirmation: 0 },
}

function timeAgo(value: string | null | undefined) {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
        />
      ))}
    </span>
  )
}

function PaymentClaimCard({
  row,
  busy,
  copied,
  onVerify,
  onCopy,
}: {
  row: ReviewRow
  busy: string | null
  copied: string | null
  onVerify: (row: ReviewRow) => void
  onCopy: (value: string, key: string) => void
}) {
  const message = (row.payment_message || '').trim()
  const canVerify = message.length > 20
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-white dark:border-amber-800 dark:bg-slate-800">
      <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <Receipt className="h-3 w-3" /> Payment claim
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-slate-900 dark:text-gray-300">
                {row.payment_status || row.status}
              </span>
              {row.payment_receipt && (
                <span className="font-mono text-[11px] font-semibold text-gray-700 dark:text-gray-200">{row.payment_receipt}</span>
              )}
              <span className="text-[11px] text-gray-400">{timeAgo(row.created_at)}</span>
            </div>
            <Link href={`/listings/${row.listing_id}`} className="mt-1.5 block truncate text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-white">
              {row.listing_title || 'House'}
            </Link>
            <p className="text-xs text-gray-500">{row.listing_location || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Amount claimed</p>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatPrice(row.listing_price || 0)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Hunter</p>
          <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{row.name || '—'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {row.phone && (
              <>
                <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline">
                  <Phone className="h-3 w-3" /> {row.phone}
                </a>
                <button type="button" onClick={() => onCopy(row.phone, `claim-phone-${row.id}`)}
                  className="inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:text-gray-300">
                  {copied === `claim-phone-${row.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === `claim-phone-${row.id}` ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
            {row.email && <span className="truncate text-[11px] text-gray-500">{row.email}</span>}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Lister</p>
          <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{row.lister_name || '—'}</p>
          <p className="mt-1 text-xs text-gray-500">
            {row.lister_phone || 'No number on file'}
          </p>
        </div>
      </div>

      <div className="mx-4 mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-slate-900/50">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <MessageSquareText className="h-3 w-3" /> Submitted M-Pesa SMS
          </p>
          {message && (
            <button type="button" onClick={() => onCopy(message, `claim-sms-${row.id}`)}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:text-gray-300">
              {copied === `claim-sms-${row.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === `claim-sms-${row.id}` ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
        <p className="mt-1 break-words text-xs leading-relaxed text-gray-700 dark:text-gray-200">
          {message || 'No SMS on file yet. Ask the hunter to submit it from their payment page.'}
        </p>
        {row.payment_result && (
          <p className="mt-1 text-[11px] text-gray-500">PayWave: {row.payment_result}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        {canVerify && (
          <button
            type="button"
            onClick={() => onVerify(row)}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy === `${row.id}:verify_payment` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Approve payment &amp; open escrow
          </button>
        )}
        <button
          type="button"
          onClick={() => window.open(`/admin/treasury?verify=${encodeURIComponent(row.id)}`, '_blank', 'noopener,noreferrer')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20">
          <Receipt className="h-3.5 w-3.5" /> Open verification panel
        </button>
        <p className="text-[11px] text-gray-500">
          PayWave is checked first; the SMS amount must match exactly before escrow opens.
        </p>
      </div>
    </div>
  )
}

export default function BookingReviewsPage() {
  const [data, setData] = useState<Data>(EMPTY)
  const [tab, setTab] = useState<Tab>('payouts')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/booking-reviews')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || `Could not load reviews (${res.status})`)
        return
      }
      setData({
        pending_payouts: json.pending_payouts || [],
        refund_requests: json.refund_requests || [],
        payment_claims: json.payment_claims || [],
        awaiting_confirmation: json.awaiting_confirmation || [],
        resolved: json.resolved || [],
        counts: json.counts || EMPTY.counts,
      })
      const nextNotes: Record<string, string> = {}
      for (const group of ['pending_payouts', 'refund_requests', 'awaiting_confirmation', 'resolved'] as const) {
        for (const row of (json[group] || []) as ReviewRow[]) {
          nextNotes[row.id] = row.feedback?.admin_note || ''
        }
      }
      setNotes(nextNotes)
    } catch {
      setError('Network error while loading booking reviews')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      /* clipboard may be blocked; the number is still visible */
    }
  }

  async function patch(row: ReviewRow, action: string, extra: Record<string, unknown> = {}) {
    setBusy(`${row.id}:${action}`)
    setError('')
    try {
      const res = await fetch('/api/admin/booking-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: row.id, action, note: notes[row.id] ?? '', ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Action failed')
        return null
      }
      await load()
      return json.feedback as BookingFeedback
    } catch {
      setError('Action failed. Nothing was changed.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function approveRefund(row: ReviewRow) {
    const feedback = await patch(row, 'approve_refund')
    if (!feedback) return
    window.open(
      `/admin/treasury?refund=${encodeURIComponent(row.id)}&percent=${row.refund_percent}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  async function declineRefund(row: ReviewRow) {
    if (!window.confirm('Decline the refund and send this booking back to the lister payout queue?')) return
    await patch(row, 'decline_refund')
  }

  async function verifyPayment(row: ReviewRow) {
    const message = (row.payment_message || '').trim()
    if (message.length < 20) {
      setError('No M-Pesa SMS is on file for this claim. Ask the hunter to submit it from their payment page.')
      return
    }
    setBusy(`${row.id}:verify_payment`)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'house_verify',
          house_booking_id: row.id,
          mpesa_message: message,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not verify that payment')
        return
      }
      setNotice(json.message || 'Payment verified and escrow opened.')
      await load()
    } catch {
      setError('Could not verify that payment. Nothing was changed.')
    } finally {
      setBusy(null)
    }
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'payments', label: 'Payment claims', count: data.counts.payment_claims },
    { id: 'payouts', label: 'Payout approvals', count: data.counts.pending_payouts },
    { id: 'refunds', label: 'Refund reviews', count: data.counts.refund_requests },
    { id: 'waiting', label: 'Awaiting hunter', count: data.counts.awaiting_confirmation },
    { id: 'resolved', label: 'Recently closed', count: data.resolved.length },
  ]

  const rows =
    tab === 'payments' ? data.payment_claims
      : tab === 'payouts' ? data.pending_payouts
        : tab === 'refunds' ? data.refund_requests
          : tab === 'waiting' ? data.awaiting_confirmation
            : data.resolved

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-gray-900)' }}>Booking reviews</h1>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--color-gray-500)' }}>
            Every hunter confirmation and refund request lands here. Contact both sides, leave a note,
            then move the money in Treasury. Nothing is paid or refunded automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-800">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Payment claims', value: data.counts.payment_claims, icon: Receipt, tone: 'blue' },
          { label: 'Payouts to verify', value: data.counts.pending_payouts, icon: Wallet, tone: 'emerald' },
          { label: 'Refunds to review', value: data.counts.refund_requests, icon: ThumbsDown, tone: 'red' },
          { label: 'Hunters to confirm', value: data.counts.awaiting_confirmation, icon: Clock, tone: 'amber' },
        ].map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setTab(
              card.label === 'Payment claims' ? 'payments'
                : card.label === 'Payouts to verify' ? 'payouts'
                  : card.label === 'Refunds to review' ? 'refunds'
                    : 'waiting'
            )}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition hover:border-gray-300 dark:border-gray-700 dark:bg-slate-800">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              card.tone === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                : card.tone === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                  : card.tone === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
            }`}>
              <card.icon className="h-5 w-5" />
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              tab === item.id
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 text-gray-600 hover:border-blue-400 dark:border-gray-600 dark:text-gray-300'
            }`}>
            {item.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === item.id ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <span className="flex items-center gap-2"><CheckCircle className="h-4 w-4" /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</span>
          <button type="button" onClick={() => setError('')} className="text-xs font-semibold underline">Dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading booking reviews…
        </div>
      ) : tab === 'payments' ? (
        data.payment_claims.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
            <CheckCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No payment claims to verify</p>
            <p className="mt-1 text-xs text-gray-400">
              Hunters who paid but were not confirmed will appear here with the M-Pesa SMS they submitted.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.payment_claims.map((row) => (
              <PaymentClaimCard
                key={row.id}
                row={row}
                busy={busy}
                copied={copied}
                onVerify={(claim) => void verifyPayment(claim)}
                onCopy={(value, key) => void copy(value, key)}
              />
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Nothing here right now</p>
          <p className="mt-1 text-xs text-gray-400">
            {tab === 'payouts' ? 'New hunter confirmations will appear here.'
              : tab === 'refunds' ? 'New refund requests will appear here.'
                : tab === 'waiting' ? 'Every held booking has been confirmed.'
                  : 'No closed bookings yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const category = getIssueCategory(row.feedback.category)
            const isRefund = tab === 'refunds'
            const isPayout = tab === 'payouts'
            const isResolved = tab === 'resolved'
            const contactedHunter = !!row.feedback.contacted_hunter_at
            const contactedLister = !!row.feedback.contacted_lister_at
            const approved = row.feedback.decision === 'refund_approved'
            const declined = row.feedback.decision === 'refund_declined'

            return (
              <div key={row.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-slate-800">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.feedback.outcome === 'pleased'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        }`}>
                          {row.feedback.outcome === 'pleased' ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                          {row.feedback.outcome === 'pleased' ? 'Pleased' : row.issue_label}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          row.release_status === 'refunded' ? 'bg-amber-100 text-amber-700'
                            : row.release_status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                              : row.feedback.outcome === 'issue' && row.feedback.decision !== 'refund_declined' && row.release_status === 'held'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700'
                        }`}>
                          {row.feedback.outcome === 'issue' && row.feedback.decision !== 'refund_declined' && row.release_status === 'held'
                            ? 'refund review'
                            : row.release_status.replace('_', ' ')}
                        </span>
                        {row.feedback.rating > 0 && <Stars rating={row.feedback.rating} />}
                        <span className="text-[11px] text-gray-400">{timeAgo(row.confirmed_at || row.created_at)}</span>
                      </div>
                      <Link href={`/listings/${row.listing_id}`} className="mt-1.5 block truncate text-sm font-semibold text-gray-900 hover:text-blue-600 dark:text-white">
                        {row.listing_title || 'House'}
                      </Link>
                      <p className="text-xs text-gray-500">{row.listing_location || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Fee</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{formatPrice(row.listing_price || 0)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 px-4 py-3 md:grid-cols-2">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Hunter</p>
                    <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{row.name || '—'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {row.phone ? (
                        <>
                          <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline">
                            <Phone className="h-3 w-3" /> {row.phone}
                          </a>
                          <button type="button" onClick={() => void copy(row.phone, `hunter-${row.id}`)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:text-gray-300">
                            {copied === `hunter-${row.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copied === `hunter-${row.id}` ? 'Copied' : 'Copy'}
                          </button>
                        </>
                      ) : <span className="text-gray-400">No phone</span>}
                    </div>
                    {row.email && <p className="mt-0.5 truncate text-[11px] text-gray-500">{row.email}</p>}
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Lister</p>
                    <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{row.lister_name || '—'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {row.lister_phone ? (
                        <>
                          <a href={`tel:${row.lister_phone}`} className="inline-flex items-center gap-1 font-mono font-semibold text-blue-600 hover:underline">
                            <Phone className="h-3 w-3" /> {row.lister_phone}
                          </a>
                          <button type="button" onClick={() => void copy(row.lister_phone!, `lister-${row.id}`)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:border-emerald-500 hover:text-emerald-700 dark:border-gray-600 dark:text-gray-300">
                            {copied === `lister-${row.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copied === `lister-${row.id}` ? 'Copied' : 'Copy'}
                          </button>
                        </>
                      ) : <span className="text-amber-700">No number on file</span>}
                    </div>
                  </div>
                </div>

                {row.feedback.review && (
                  <div className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      <MessageSquareText className="h-3 w-3" /> Hunter review
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">&ldquo;{row.feedback.review}&rdquo;</p>
                  </div>
                )}

                {row.feedback.outcome === 'issue' && row.feedback.details && (
                  <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/20">
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> What happened · {category.label}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-red-900 dark:text-red-200">{row.feedback.details}</p>
                    <p className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                      Refund requested: {formatPrice(row.refund_amount)} ({row.refund_percent}%)
                    </p>
                  </div>
                )}

                {row.feedback.outcome === 'pleased' && (
                  <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Wallet className="h-3.5 w-3.5" /> Payout {formatPrice(row.payout_amount)} (50%)
                    </span>
                    <span>Hunter paid {formatPrice(row.listing_price || 0)}</span>
                    {row.mpesa_receipt && <span>Receipt {row.mpesa_receipt}</span>}
                  </div>
                )}

                {!isResolved && (
                  <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void patch(row, 'contacted_hunter')}
                        disabled={!!busy}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          contactedHunter
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'border-gray-300 text-gray-600 hover:border-emerald-400 dark:border-gray-600 dark:text-gray-300'
                        }`}>
                        {busy === `${row.id}:contacted_hunter` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : contactedHunter ? <Check className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        {contactedHunter ? `Hunter contacted ${timeAgo(row.feedback.contacted_hunter_at)}` : 'Mark hunter contacted'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void patch(row, 'contacted_lister')}
                        disabled={!!busy}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          contactedLister
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'border-gray-300 text-gray-600 hover:border-emerald-400 dark:border-gray-600 dark:text-gray-300'
                        }`}>
                        {busy === `${row.id}:contacted_lister` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : contactedLister ? <Check className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
                        {contactedLister ? `Lister contacted ${timeAgo(row.feedback.contacted_lister_at)}` : 'Mark lister contacted'}
                      </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={notes[row.id] ?? ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        placeholder="Admin note — what each side said, next step…"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={() => void patch(row, 'save_note')}
                        disabled={!!busy}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-900">
                        {busy === `${row.id}:save_note` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Save note
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isPayout && (
                        <>
                          <button
                            type="button"
                            onClick={() => window.open(`/admin/treasury?booking=${encodeURIComponent(row.id)}`, '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                            <Wallet className="h-3.5 w-3.5" /> Pay lister in Treasury
                          </button>
                          <Link href="/admin/treasury" className="text-xs font-medium text-blue-600 hover:underline">
                            Open Treasury
                          </Link>
                        </>
                      )}

                      {isRefund && (
                        <>
                          {approved ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                              <CheckCircle className="h-4 w-4" /> Approved — complete the M-Pesa refund in Treasury
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void approveRefund(row)}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                              {busy === `${row.id}:approve_refund` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                              Approve &amp; refund {row.refund_percent}%
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => window.open(`/admin/treasury?refund=${encodeURIComponent(row.id)}&percent=${row.refund_percent}`, '_blank', 'noopener,noreferrer')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20">
                            <RefreshCw className="h-3.5 w-3.5" /> Open refund panel
                          </button>
                          {declined ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 dark:bg-slate-900 dark:text-gray-300">
                              <Ban className="h-4 w-4" /> Refund declined — back in payout queue
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void declineRefund(row)}
                              disabled={!!busy}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-slate-900">
                              {busy === `${row.id}:decline_refund` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                              Decline refund
                            </button>
                          )}
                        </>
                      )}

                      {tab === 'waiting' && (
                        <button
                          type="button"
                          onClick={() => window.open(`/admin/treasury?booking=${encodeURIComponent(row.id)}`, '_blank', 'noopener,noreferrer')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20">
                          <Clock className="h-3.5 w-3.5" /> Open in Treasury
                        </button>
                      )}
                    </div>

                    {row.feedback.admin_note && (
                      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span className="font-semibold">Saved note:</span> {row.feedback.admin_note}
                      </p>
                    )}
                  </div>
                )}

                {isResolved && (
                  <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {row.release_status === 'paid'
                      ? `Paid ${formatPrice(row.payout_amount)} to the lister${row.paid_at ? ` on ${new Date(row.paid_at).toLocaleDateString()}` : ''}.`
                      : `Refunded ${formatPrice(row.refund_amount || row.listing_price || 0)} to the hunter${row.refunded_at ? ` on ${new Date(row.refunded_at).toLocaleDateString()}` : ''}.`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
