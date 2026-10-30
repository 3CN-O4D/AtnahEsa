'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Download,
  Search,
  Loader2,
  RefreshCw,
  ReceiptText,
  CheckCircle2,
  Clock3,
  ExternalLink,
} from 'lucide-react'
import Button from '@/components/ui/Button'

type ReceiptRow = {
  id: string
  listing_title: string | null
  listing_location: string | null
  listing_price: number | null
  name: string | null
  email: string | null
  phone: string | null
  mpesa_receipt: string | null
  paid_at: string | null
  created_at: string
  release_status: string | null
  payment_method: string | null
}

export default function AdminReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [reference, setReference] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/receipts?list=1')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setError(data?.error || 'Could not load bookings')
        return
      }
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setError('Network error while loading bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      // Defer past the effect body so state updates are not synchronous here.
      await Promise.resolve()
      if (!cancelled) void load()
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [load])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.name, row.email, row.phone, row.mpesa_receipt, row.listing_title, row.listing_location]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    )
  }, [rows, search])

  const download = (query: string) => {
    window.open(`/api/admin/receipts?${query}`, '_blank', 'noopener')
  }

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = reference.trim()
    if (!value) return
    setLooking(true)
    setLookupError('')
    try {
      // Resolve either a receipt number or a booking id, then open the PDF.
      const res = await fetch(`/api/admin/receipts?receipt=${encodeURIComponent(value)}`)
      if (!res.ok) {
        // A booking UUID is also accepted.
        const alt = await fetch(`/api/admin/receipts?booking_id=${encodeURIComponent(value)}`)
        if (!alt.ok) {
          const data = await alt.json().catch(() => ({}))
          setLookupError(data?.error || 'No receipt found for that reference')
          return
        }
        const blob = await alt.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setLookupError('Network error while generating the receipt')
    } finally {
      setLooking(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Finance tools
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            Receipt generator
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Re-download any booking receipt, or look one up by M-Pesa / PayWave reference.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <form
        onSubmit={lookup}
        className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Receipt number or booking ID
          </span>
          <div className="relative mt-1">
            <ReceiptText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UJU010A2W3 or 4e2b…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </label>
        <button
          type="submit"
          disabled={looking || !reference.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generate
        </button>
      </form>
      {lookupError && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{lookupError}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Recent bookings
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, receipt…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-16 text-gray-500">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          <p className="text-sm">Loading bookings…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <FileText className="mx-auto h-9 w-9 text-gray-400" />
          <h2 className="mt-3 text-base font-bold text-gray-900 dark:text-white">No bookings found</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Receipts appear here as soon as a booking exists.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="hidden grid-cols-[1.5fr_1fr_0.7fr_0.8fr_auto] gap-4 border-b border-gray-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-slate-800 dark:text-gray-400 lg:grid">
            <span>Booking</span>
            <span>Payer</span>
            <span>Amount</span>
            <span>Status</span>
            <span className="text-right">Receipt</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filtered.map((row) => {
              const paid = Boolean(row.paid_at)
              return (
                <div
                  key={row.id}
                  className="grid gap-2 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60 lg:grid-cols-[1.5fr_1fr_0.7fr_0.8fr_auto] lg:items-center lg:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {row.listing_title || 'House listing'}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {row.listing_location || '—'} · {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800 dark:text-gray-200">{row.name || '—'}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.phone || row.email || '—'}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    KES {Number(row.listing_price || 0).toLocaleString('en-KE')}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <Clock3 className="h-3 w-3" /> Unpaid
                      </span>
                    )}
                    {row.mpesa_receipt && (
                      <span className="font-mono text-[10px] text-gray-400">{row.mpesa_receipt}</span>
                    )}
                  </div>
                  <div className="flex justify-start lg:justify-end">
                    <button
                      type="button"
                      onClick={() => download(`booking_id=${row.id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-gray-200 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <ExternalLink className="h-3.5 w-3.5" />
        Receipts are generated from stored booking data, so the amount always matches what was charged.
      </p>
    </div>
  )
}
