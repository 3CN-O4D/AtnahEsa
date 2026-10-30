'use client'

import { useState, useEffect } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownLeft, RotateCcw, Banknote, RefreshCw, Wallet, TrendingUp, Clock, CheckCircle, XCircle, Search, AlertTriangle, Calendar } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPrice } from '@/lib/utils'
import { OWNER_SHARE } from '@/lib/constants'
import type { EscrowHold, Transaction, Booking, HouseBooking } from '@/types'

type EscrowWithDetails = EscrowHold & {
  booking?: Booking
  listing?: { title: string }
}

type HouseBookingWithPayment = HouseBooking & {
  payment_status?: string | null
  transaction_id?: string | null
  transaction_receipt?: string | null
}

type RefundModal = { escrow: EscrowWithDetails } | null
type ExtendModal = { escrow: EscrowWithDetails } | null
type ConfirmAction = { escrow?: EscrowWithDetails; houseBooking?: HouseBooking; action: string; label: string } | null
type SmsAction = { houseBooking: HouseBookingWithPayment; action: 'house_verify' | 'house_release' | 'house_refund'; label: string } | null

export default function TreasuryPage() {
  const [stats, setStats] = useState({
    total_escrows: 0, held: 0, released: 0, refunded: 0,
    total_held_amount: 0, total_released_amount: 0, total_refunded_amount: 0, platform_revenue: 0,
    pending_payouts: 0, pending_payouts_amount: 0,
  })
  const [escrows, setEscrows] = useState<EscrowWithDetails[]>([])
  const [houseBookings, setHouseBookings] = useState<HouseBookingWithPayment[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<{ configured: boolean; result?: unknown; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [escrowFilter, setEscrowFilter] = useState<string>('all')
  const [payoutFilter, setPayoutFilter] = useState<string>('pending')
  const [txSearch, setTxSearch] = useState('')
  const [refundModal, setRefundModal] = useState<RefundModal>(null)
  const [extendModal, setExtendModal] = useState<ExtendModal>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [smsAction, setSmsAction] = useState<SmsAction>(null)
  const [smsText, setSmsText] = useState('')
  const [smsError, setSmsError] = useState('')
  const [smsRefundPercentage, setSmsRefundPercentage] = useState(85)
  const [statusModal, setStatusModal] = useState<{ houseBooking: HouseBookingWithPayment } | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [newReleaseStatus, setNewReleaseStatus] = useState('')

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const loadData = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/admin/treasury')
      const treasury = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError(treasury?.error || `Treasury could not load (${res.status})`)
        return
      }
      if (treasury.stats) setStats(treasury.stats)
      setEscrows(Array.isArray(treasury.escrows) ? treasury.escrows : [])
      setHouseBookings(Array.isArray(treasury.house_bookings) ? treasury.house_bookings : [])
      setTransactions(Array.isArray(treasury.transactions) ? treasury.transactions : [])

      // Balance is optional; never let it block the ledger.
      try {
        const balRes = await fetch('/api/daraja/balance')
        setBalance(await balRes.json())
      } catch {
        setBalance({ configured: false, error: 'Balance endpoint unavailable' })
      }
    } catch {
      setLoadError('Network error while loading treasury data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const postAction = async (body: Record<string, unknown>) => {
    setActionLoading((body.house_booking_id || body.escrow_id || body.transaction_id) as string)
    try {
      const res = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { showToast('error', data.error); return }
      showToast('success', data.message)
      const tres = await (await fetch('/api/admin/treasury')).json()
      setStats(tres.stats)
      setEscrows(tres.escrows)
      setHouseBookings(tres.house_bookings || [])
      setTransactions(tres.transactions)
    } catch {
      showToast('error', 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAction = (escrowId: string, action: string, label: string) =>
    setConfirmAction({ escrow: escrows.find((e) => e.id === escrowId)!, action, label })

  const handleHouseAction = (hbId: string, action: 'house_verify' | 'house_release' | 'house_refund', label: string) => {
    const houseBooking = houseBookings.find((h) => h.id === hbId)
    if (!houseBooking) return
    setSmsError('')
    setSmsText('')
    if (action === 'house_refund') setSmsRefundPercentage(85)
    setSmsAction({ houseBooking, action, label })
  }

  const submitSmsAction = async () => {
    if (!smsAction) return
    if (!smsText.trim()) {
      setSmsError('Paste the M-Pesa SMS before continuing.')
      return
    }
    setActionLoading(smsAction.houseBooking.id)
    setSmsError('')
    try {
      const res = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: smsAction.action,
          house_booking_id: smsAction.houseBooking.id,
          mpesa_message: smsText,
          ...(smsAction.action === 'house_refund' ? { percentage: smsRefundPercentage } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSmsError(data.error || 'Action failed')
        return
      }
      showToast('success', data.message)
      setSmsAction(null)
      setSmsText('')
      loadData()
    } catch {
      setSmsError('Action failed. Nothing was changed.')
    } finally {
      setActionLoading(null)
    }
  }

  const openStatusModal = (hb: HouseBookingWithPayment) => {
    setNewStatus(hb.status || 'pending')
    setNewReleaseStatus(hb.release_status || 'pending')
    setStatusModal({ houseBooking: hb })
  }

  const submitStatusChange = async () => {
    if (!statusModal) return
    setActionLoading(statusModal.houseBooking.id)
    try {
      const res = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'house_status',
          house_booking_id: statusModal.houseBooking.id,
          status: newStatus,
          release_status: newReleaseStatus,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Could not change status')
        return
      }
      showToast('success', data.message)
      setStatusModal(null)
      loadData()
    } catch {
      showToast('error', 'Could not change status')
    } finally {
      setActionLoading(null)
    }
  }

  const executeConfirmedAction = () => {
    if (!confirmAction) return
    if (confirmAction.houseBooking) {
      postAction({ action: confirmAction.action, house_booking_id: confirmAction.houseBooking.id })
    } else if (confirmAction.escrow) {
      postAction({ action: confirmAction.action, escrow_id: confirmAction.escrow.id })
    }
    setConfirmAction(null)
  }

  const handleRefund = async () => {
    if (!refundModal) return
    const escrow = refundModal.escrow
    const refundAmount = Math.round((escrow.amount || 0) * (refundPercentage / 100))

    if (!refundPhone || refundPhone.length < 10) {
      showToast('error', 'Enter a valid M-Pesa phone number for the refund')
      return
    }

    setActionLoading(escrow.id)
    try {
      const res = await fetch('/api/payments/b2c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: refundPhone,
          amount: refundAmount,
          booking_id: escrow.booking_id,
          escrow_id: escrow.id,
          remarks: `Refund ${refundPercentage}% for ${escrow.listing?.title || 'listing'}`,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showToast('error', data.error || 'B2C failed'); return }
      showToast('success', `Refund of KES ${refundAmount.toLocaleString()} sent to ${refundPhone}`)
      setRefundModal(null)
      loadData()
    } catch {
      showToast('error', 'Failed to process refund')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExtend = () => {
    if (!extendModal) return
    postAction({ action: 'extend_hold', escrow_id: extendModal.escrow.id, days: extendDays })
    setExtendModal(null)
  }

  const handleReverseTx = (txId: string) => {
    postAction({ action: 'reverse_tx', transaction_id: txId })
  }

  const [refundPercentage, setRefundPercentage] = useState(85)
  const [refundPhone, setRefundPhone] = useState('')
  const [extendDays, setExtendDays] = useState(7)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading the treasury ledger…</p>
      </div>
    )
  }

  const filteredEscrows = escrowFilter === 'all' ? escrows : escrows.filter((e) => e.status === escrowFilter)
  const filteredPayouts = payoutFilter === 'all' ? houseBookings : houseBookings.filter((h) => h.release_status === payoutFilter)
  const filteredTxs = transactions.filter((tx) =>
    !txSearch || tx.mpesa_receipt?.toLowerCase().includes(txSearch.toLowerCase()) ||
    tx.mpesa_message?.toLowerCase().includes(txSearch.toLowerCase()) ||
    formatPrice(tx.amount).includes(txSearch)
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-xl animate-slideInRight ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Finance
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            Treasury &amp; escrow
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Held funds, lister payouts, hunter refunds and the payment ledger.
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loadError && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* M-Pesa Balance */}
      <div className="mt-5 mb-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-lg shadow-emerald-900/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-100">
              <Wallet className="h-4 w-4" /> M-Pesa balance
            </p>
            {balance?.configured === false ? (
              <p className="mt-1 text-sm text-emerald-100">Keys not configured</p>
            ) : balance?.error ? (
              <p className="mt-1 text-sm text-emerald-100">Query failed — {balance.error}</p>
            ) : (
              <p className="mt-1 text-3xl font-extrabold">—</p>
            )}
          </div>
          <div className="text-right text-xs text-emerald-100">
            <p>Daraja {process.env.NEXT_PUBLIC_DARAJA_TILL_NUMBER ? 'Connected' : 'Not connected'}</p>
            <p className="mt-0.5">
              {process.env.NEXT_PUBLIC_DARAJA_TILL_NUMBER ? `Till: ${process.env.NEXT_PUBLIC_DARAJA_TILL_NUMBER}` : 'Set DARAJA keys in .env'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">In Escrow</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-gray-900)' }}>{stats.held}</p>
          <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>{formatPrice(stats.total_held_amount)}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Released</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-gray-900)' }}>{stats.released}</p>
          <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>{formatPrice(stats.total_released_amount)}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <RotateCcw className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Refunded</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--color-gray-900)' }}>{stats.refunded}</p>
          <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>{formatPrice(stats.total_refunded_amount)}</p>
        </div>
        <div className="border rounded-xl p-4" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Platform Revenue</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{formatPrice(stats.platform_revenue)}</p>
          <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>30% of {stats.released} releases</p>
        </div>
      </div>

      {/* Pending Payouts */}
      <div className="border rounded-xl mb-8" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: 'var(--color-gray-200)' }}>
          <h2 className="font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4 text-green-600" /> Pending Payouts (House Payments)
            {stats.pending_payouts > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                {stats.pending_payouts} &middot; {formatPrice(stats.pending_payouts_amount)}
              </span>
            )}
          </h2>
          <div className="flex gap-1">
            {['pending', 'held', 'paid', 'refunded', 'all'].map((f) => (
              <button key={f} onClick={() => setPayoutFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  payoutFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'border text-gray-600 hover:bg-gray-100'
                }`}
                style={payoutFilter !== f ? { borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-600)' } : {}}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {filteredPayouts.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No house payments found.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-gray-200)' }}>
            {filteredPayouts.map((hb) => {
              const isHeld = hb.release_status === 'held'
              const confirmed = hb.rating != null
              const isOverdue = isHeld && hb.held_until && new Date(hb.held_until) < new Date()
              return (
                <div key={hb.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        hb.release_status === 'held' ? (isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700') :
                        hb.release_status === 'paid' ? 'bg-green-100 text-green-700' :
                        hb.release_status === 'refunded' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isHeld && isOverdue ? <AlertTriangle className="w-3 h-3" /> :
                         isHeld ? <Clock className="w-3 h-3" /> :
                         hb.release_status === 'paid' ? <CheckCircle className="w-3 h-3" /> :
                         hb.release_status === 'refunded' ? <RotateCcw className="w-3 h-3" /> :
                         null}
                        {hb.release_status}{isOverdue ? ' (overdue)' : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium capitalize">{hb.payment_method || 'payment'}</span>
                      {hb.payment_status === 'verifying' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <Clock className="w-3 h-3" /> Under review
                        </span>
                      )}
                      {hb.payment_status === 'failed' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3" /> Payment failed
                        </span>
                      )}
                      {isHeld && !confirmed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <AlertTriangle className="w-3 h-3" /> Hunter not confirmed
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate mt-1" style={{ color: 'var(--color-gray-900)' }}>{hb.listing_title || 'Unknown listing'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
                      {formatPrice(hb.listing_price || 0)} &middot; Hunter: {hb.phone || hb.name || 'N/A'}
                      {hb.user_id && ' &middot; Linked account'}
                      {isHeld && hb.held_until && <> &middot; Held until {new Date(hb.held_until).toLocaleDateString()}</>}
                      {hb.release_status === 'paid' && hb.paid_at && <> &middot; Paid {new Date(hb.paid_at).toLocaleDateString()}</>}
                      {hb.release_status === 'refunded' && hb.refunded_at && <> &middot; Refunded {new Date(hb.refunded_at).toLocaleDateString()}</>}
                      {hb.confirmed_at && hb.rating != null && <> &middot; Hunter confirmed {new Date(hb.confirmed_at).toLocaleDateString()}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    {hb.release_status !== 'held' && hb.release_status !== 'paid' && hb.release_status !== 'refunded' && (
                      <Button size="sm" onClick={() => handleHouseAction(hb.id, 'house_verify', 'Verify payment & set escrow')} loading={actionLoading === hb.id}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1">
                        <CheckCircle className="w-3 h-3 mr-1" /> Verify & Set Escrow
                      </Button>
                    )}
                    {isHeld && (
                      <>
                        <Button size="sm" onClick={() => handleHouseAction(hb.id, 'house_release', 'Mark paid to lister')} loading={actionLoading === hb.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1">
                          <ArrowUpRight className="w-3 h-3 mr-1" /> Mark Paid
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleHouseAction(hb.id, 'house_refund', 'Refund hunter')} loading={actionLoading === hb.id}
                          className="text-xs px-2.5 py-1">
                          <ArrowDownLeft className="w-3 h-3 mr-1" /> Refund
                        </Button>
                      </>
                    )}
                    {hb.release_status === 'paid' && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-medium">Paid to lister</span>
                    )}
                    {hb.release_status === 'refunded' && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium">Refunded</span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openStatusModal(hb)} loading={actionLoading === hb.id}
                      className="text-xs px-2.5 py-1">
                      <RefreshCw className="w-3 h-3 mr-1" /> Status
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* All Escrows */}
      <div className="border rounded-xl mb-8" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
        <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: 'var(--color-gray-200)' }}>
          <h2 className="font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4 text-blue-600" /> All Escrows ({escrows.length})
          </h2>
          <div className="flex gap-1">
            {['all', 'held', 'released', 'refunded'].map((f) => (
              <button key={f} onClick={() => setEscrowFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  escrowFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'border text-gray-600 hover:bg-gray-100'
                }`}
                style={escrowFilter !== f ? { borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-600)' } : {}}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {filteredEscrows.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No escrows found.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-gray-200)' }}>
            {filteredEscrows.map((e) => {
              const isOverdue = e.status === 'held' && new Date(e.held_until) < new Date()
              return (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.status === 'held' ? (isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700') :
                        e.status === 'released' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {e.status === 'held' && isOverdue ? <AlertTriangle className="w-3 h-3" /> :
                         e.status === 'held' ? <Clock className="w-3 h-3" /> :
                         e.status === 'released' ? <CheckCircle className="w-3 h-3" /> :
                         <RotateCcw className="w-3 h-3" />}
                        {e.status}{isOverdue ? ' (overdue)' : ''}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate mt-1" style={{ color: 'var(--color-gray-900)' }}>{e.listing?.title || 'Unknown listing'}</p>
                    <p className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
                      {formatPrice(e.amount)} &middot; Created {new Date(e.created_at).toLocaleDateString()}
                      {e.status === 'held' && <> &middot; Held until {new Date(e.held_until).toLocaleDateString()}</>}
                      {e.status === 'released' && e.released_at && <> &middot; Released {new Date(e.released_at).toLocaleDateString()}</>}
                      {e.status === 'refunded' && e.refunded_at && <> &middot; Refunded {new Date(e.refunded_at).toLocaleDateString()}</>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    {e.status === 'held' && (
                      <>
                        <Button size="sm" onClick={() => handleAction(e.id, 'release', 'Release funds')} loading={actionLoading === e.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-2.5 py-1">
                          <ArrowUpRight className="w-3 h-3 mr-1" /> Release
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRefundModal({ escrow: e })} loading={actionLoading === e.id}
                          className="text-xs px-2.5 py-1">
                          <ArrowDownLeft className="w-3 h-3 mr-1" /> Refund
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExtendModal({ escrow: e })} loading={actionLoading === e.id}
                          className="text-xs px-2.5 py-1">
                          <Calendar className="w-3 h-3 mr-1" /> Extend
                        </Button>
                      </>
                    )}
                    {e.status === 'released' && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-medium">Completed</span>
                    )}
                    {e.status === 'refunded' && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium">Closed</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="border rounded-xl" style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-200)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-gray-200)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4" style={{ color: 'var(--color-gray-600)' }} /> Recent Transactions
            </h2>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-gray-400)' }} />
              <input type="text" placeholder="Search transactions..." value={txSearch} onChange={(e) => setTxSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-900)' }} />
            </div>
          </div>
        </div>
        {filteredTxs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ backgroundColor: 'var(--color-gray-100)', borderColor: 'var(--color-gray-200)' }}>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Receipt</th>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Amount</th>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Status</th>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Message</th>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Date</th>
                  <th className="text-left p-3 font-medium" style={{ color: 'var(--color-gray-700)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map((tx) => (
                  <tr key={tx.id} className="border-b hover:bg-gray-50/50 transition-colors" style={{ borderColor: 'var(--color-gray-200)' }}>
                    <td className="p-3 font-mono text-xs" style={{ color: 'var(--color-gray-600)' }}>{tx.mpesa_receipt || tx.checkout_request_id?.slice(0, 16) || '-'}</td>
                    <td className={`p-3 font-medium ${tx.amount < 0 ? 'text-red-600' : ''}`} style={tx.amount >= 0 ? { color: 'var(--color-gray-900)' } : {}}>
                      {tx.amount < 0 ? '-' : ''}{formatPrice(Math.abs(tx.amount))}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        tx.status === 'success' ? 'bg-green-100 text-green-700' :
                        tx.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {tx.status === 'success' ? <CheckCircle className="w-3 h-3" /> :
                         tx.status === 'failed' ? <XCircle className="w-3 h-3" /> :
                         <Clock className="w-3 h-3" />}
                        {tx.status}
                      </span>
                    </td>
                    <td className="p-3 max-w-[200px] truncate" style={{ color: 'var(--color-gray-500)' }}>{tx.mpesa_message || '-'}</td>
                    <td className="p-3 whitespace-nowrap" style={{ color: 'var(--color-gray-500)' }}>{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="p-3">
                      {tx.amount > 0 && (
                        <Button size="sm" variant="outline" onClick={() => handleReverseTx(tx.id)}
                          loading={actionLoading === tx.id}
                          className="text-xs px-2 py-0.5 text-red-600 border-red-200 hover:bg-red-50">
                          <RotateCcw className="w-3 h-3 mr-1" /> Reverse
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRefundModal(null)}>
          <div className="rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-gray-900)' }}>Process Refund</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-gray-600)' }}>
              {refundModal.escrow.listing?.title} &middot; {formatPrice(refundModal.escrow.amount)}
            </p>
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-gray-700)' }}>Customer M-Pesa Number</label>
                <input type="tel" value={refundPhone} onChange={(e) => setRefundPhone(e.target.value)}
                  placeholder="0712 345 678"
                  className="block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: 'var(--color-gray-50)', borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-900)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-gray-700)' }}>Refund Percentage</label>
                <div className="flex gap-2">
                  {[50, 85, 100].map((p) => (
                    <button key={p} onClick={() => setRefundPercentage(p)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        refundPercentage === p ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'
                      }`}
                      style={refundPercentage !== p ? { borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-700)' } : {}}>
                      {p}%
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <span className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
                    Amount: {formatPrice(Math.round(refundModal.escrow.amount * refundPercentage / 100))}
                    {refundPercentage < 100 && ` (platform retains ${formatPrice(refundModal.escrow.amount - Math.round(refundModal.escrow.amount * refundPercentage / 100))})`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRefundModal(null)}>Cancel</Button>
              <Button onClick={handleRefund} loading={actionLoading === refundModal.escrow.id}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                Send KES {Math.round((refundModal.escrow.amount * refundPercentage) / 100).toLocaleString()}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExtendModal(null)}>
          <div className="rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--color-gray-900)' }}>Extend Hold Period</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-gray-600)' }}>
              {extendModal.escrow.listing?.title} &middot; Currently held until {new Date(extendModal.escrow.held_until).toLocaleDateString()}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-gray-700)' }}>Extra Days</label>
              <div className="flex gap-2">
                {[3, 7, 14, 30].map((d) => (
                  <button key={d} onClick={() => setExtendDays(d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      extendDays === d ? 'bg-blue-600 text-white' : 'border hover:bg-gray-100'
                    }`}
                    style={extendDays !== d ? { borderColor: 'var(--color-gray-300)', color: 'var(--color-gray-700)' } : {}}>
                    {d}d
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-gray-500)' }}>
                New held until: {new Date(Date.now() + extendDays * 86400000).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setExtendModal(null)}>Cancel</Button>
              <Button onClick={handleExtend} loading={actionLoading === extendModal.escrow.id}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                Extend {extendDays} Days
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SMS Action Modal (verify / payout / refund) */}
      {smsAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSmsAction(null)}>
          <div className="w-full max-w-md rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-gray-900)' }}>
              {smsAction.action === 'house_verify'
                ? 'Verify payment with M-Pesa SMS'
                : smsAction.action === 'house_release'
                  ? 'Record lister payout'
                  : 'Record hunter refund'}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-gray-600)' }}>
              {smsAction.houseBooking.listing_title || 'Unknown listing'} &middot;{' '}
              {formatPrice(smsAction.houseBooking.listing_price || 0)}
            </p>

            <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {smsAction.action === 'house_verify' && (
                <>Expected amount: <strong>{formatPrice(smsAction.houseBooking.listing_price || 0)}</strong>. The SMS must say ASEHANTA INVESTMENTS and match the exact amount.</>
              )}
              {smsAction.action === 'house_release' && (
                <>Expected payout: <strong>{formatPrice(Math.round((smsAction.houseBooking.listing_price || 0) * OWNER_SHARE))}</strong> ({Math.round(OWNER_SHARE * 100)}% lister share). A mismatch will be refused.</>
              )}
              {smsAction.action === 'house_refund' && (
                <>
                  Refund rate:{' '}
                  <span className="mt-1 flex gap-1.5">
                    {[
                      { p: 85, label: '85% — viewed & changed mind' },
                      { p: 100, label: '100% — fake listing / no-show' },
                    ].map(({ p, label }) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSmsRefundPercentage(p)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                          smsRefundPercentage === p ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-200 bg-white text-blue-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                  <span className="mt-1 block">
                    Expected refund: <strong>{formatPrice(Math.round((smsAction.houseBooking.listing_price || 0) * (smsRefundPercentage / 100)))}</strong>{' '}
                    ({smsRefundPercentage}%). The amount in the SMS must match exactly or nothing is changed.
                  </span>
                </>
              )}
            </div>

            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-gray-700)' }}>
              M-Pesa confirmation SMS <span className="text-red-500">*</span>
            </label>
            <textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              rows={4}
              placeholder="Paste the full M-Pesa message here…"
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-gray-300)', backgroundColor: 'white' }}
            />
            <p className="mt-1 text-xs" style={{ color: 'var(--color-gray-500)' }}>
              The transaction code and amount are read from this message and saved to the audit trail.
            </p>

            {smsError && <p className="mt-2 text-xs text-red-600">{smsError}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSmsAction(null)}>Cancel</Button>
              <Button onClick={submitSmsAction} loading={actionLoading === smsAction.houseBooking.id}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                {smsAction.action === 'house_verify'
                  ? 'Verify & open escrow'
                  : smsAction.action === 'house_release'
                    ? 'Record payout'
                    : 'Record refund'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setStatusModal(null)}>
          <div className="w-full max-w-sm rounded-xl p-6 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-gray-900)' }}>Change payment status</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-gray-600)' }}>
              {statusModal.houseBooking.listing_title || 'Unknown listing'} &middot;{' '}
              {formatPrice(statusModal.houseBooking.listing_price || 0)}
            </p>

            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-gray-600)' }}>Booking status</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-gray-300)', backgroundColor: 'white' }}>
              {['pending', 'contacted', 'confirmed', 'completed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-gray-600)' }}>Escrow / release status</label>
            <select value={newReleaseStatus} onChange={(e) => setNewReleaseStatus(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-gray-300)', backgroundColor: 'white' }}>
              {['pending', 'held', 'refund_requested', 'rejected'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <p className="mt-2 text-xs" style={{ color: 'var(--color-gray-500)' }}>
              Setting escrow to <strong>held</strong> requires a stored payment receipt. Use the SMS verify action for
              new payments. Marking a lister <strong>paid</strong> or recording a <strong>refund</strong> requires the
              M-Pesa SMS — use the Record Payout / Record Refund actions.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStatusModal(null)}>Cancel</Button>
              <Button onClick={submitStatusChange} loading={actionLoading === statusModal.houseBooking.id}
                className="bg-blue-600 hover:bg-blue-700 text-white">
                Save status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmAction(null)}>
          <div className="rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-gray-900)' }}>Confirm {confirmAction.label}</h3>
            {confirmAction.houseBooking ? (
              <p className="text-sm mb-4" style={{ color: 'var(--color-gray-600)' }}>
                {confirmAction.houseBooking.listing_title || 'Unknown listing'} &middot; {formatPrice(confirmAction.houseBooking.listing_price || 0)}
                <br />
                <span className="text-xs" style={{ color: 'var(--color-gray-500)' }}>
                  {confirmAction.action === 'house_refund'
                    ? `Hunter will receive 85% (${formatPrice(Math.round((confirmAction.houseBooking.listing_price || 0) * 0.85))}). The lister gets nothing.`
                    : confirmAction.action === 'house_verify'
                      ? 'This confirms the payment arrived and places the money in 24h escrow. The hunter will see it in My Bookings.'
                      : confirmAction.houseBooking.confirmed_at
                        ? 'Hunter has confirmed they are pleased. Confirm you have paid the lister.'
                        : 'Warning: the hunter has NOT confirmed yet. Only proceed if you verified satisfaction another way.'}
                </span>
              </p>
            ) : (
              <p className="text-sm mb-4" style={{ color: 'var(--color-gray-600)' }}>
                {confirmAction.escrow?.listing?.title || 'Unknown listing'} &middot; {formatPrice(confirmAction.escrow?.amount || 0)}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button onClick={() => { executeConfirmedAction() }}
                className={`text-white ${confirmAction.action.includes('release') || confirmAction.action === 'house_release' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                Confirm {confirmAction.label}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
