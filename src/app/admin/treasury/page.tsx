'use client'

import { useState, useEffect } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownLeft, RotateCcw, Banknote, RefreshCw, Wallet, TrendingUp, Clock, CheckCircle, XCircle, Search, AlertTriangle, Calendar } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPrice } from '@/lib/utils'
import type { EscrowHold, Transaction, Booking } from '@/types'

type EscrowWithDetails = EscrowHold & {
  booking?: Booking
  listing?: { title: string }
}

type RefundModal = { escrow: EscrowWithDetails } | null
type ExtendModal = { escrow: EscrowWithDetails } | null
type ConfirmAction = { escrow: EscrowWithDetails; action: string; label: string } | null

export default function TreasuryPage() {
  const [stats, setStats] = useState({
    total_escrows: 0, held: 0, released: 0, refunded: 0,
    total_held_amount: 0, total_released_amount: 0, total_refunded_amount: 0, platform_revenue: 0,
  })
  const [escrows, setEscrows] = useState<EscrowWithDetails[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<{ configured: boolean; result?: unknown; error?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [escrowFilter, setEscrowFilter] = useState<string>('all')
  const [txSearch, setTxSearch] = useState('')
  const [refundModal, setRefundModal] = useState<RefundModal>(null)
  const [extendModal, setExtendModal] = useState<ExtendModal>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  const loadData = () => {
    Promise.all([
      fetch('/api/admin/treasury').then((r) => r.json()),
      fetch('/api/daraja/balance').then((r) => r.json()),
    ]).then(([treasury, bal]) => {
      setStats(treasury.stats)
      setEscrows(treasury.escrows)
      setTransactions(treasury.transactions)
      setBalance(bal)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const postAction = async (body: Record<string, unknown>) => {
    setActionLoading((body.escrow_id || body.transaction_id) as string)
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
      setTransactions(tres.transactions)
    } catch {
      showToast('error', 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleAction = (escrowId: string, action: string, label: string) =>
    setConfirmAction({ escrow: escrows.find((e) => e.id === escrowId)!, action, label })

  const executeConfirmedAction = () => {
    if (!confirmAction) return
    postAction({ action: confirmAction.action, escrow_id: confirmAction.escrow.id })
    setConfirmAction(null)
  }

  const handleRefund = () => {
    if (!refundModal) return
    postAction({ action: 'refund', escrow_id: refundModal.escrow.id, percentage: refundPercentage })
    setRefundModal(null)
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
  const [extendDays, setExtendDays] = useState(7)

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

  const filteredEscrows = escrowFilter === 'all' ? escrows : escrows.filter((e) => e.status === escrowFilter)
  const filteredTxs = transactions.filter((tx) =>
    !txSearch || tx.mpesa_receipt?.toLowerCase().includes(txSearch.toLowerCase()) ||
    tx.mpesa_message?.toLowerCase().includes(txSearch.toLowerCase()) ||
    formatPrice(tx.amount).includes(txSearch)
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Treasury</h1>
        <button onClick={loadData} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* M-Pesa Balance */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm font-medium flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> M-Pesa Balance
            </p>
            {balance?.configured === false ? (
              <p className="text-blue-200 text-sm mt-1">Keys not configured</p>
            ) : balance?.error ? (
              <p className="text-blue-200 text-sm mt-1">Query failed — {balance.error}</p>
            ) : (
              <p className="text-3xl font-bold mt-1">—</p>
            )}
          </div>
          <div className="text-right text-blue-200 text-xs">
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
            <div className="mb-4">
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
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRefundModal(null)}>Cancel</Button>
              <Button onClick={handleRefund} loading={actionLoading === refundModal.escrow.id}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                Refund {refundPercentage}%
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

      {/* Confirm Action Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmAction(null)}>
          <div className="rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'var(--color-gray-50)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-gray-900)' }}>Confirm {confirmAction.label}</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-gray-600)' }}>
              {confirmAction.escrow.listing?.title || 'Unknown listing'} &middot; {formatPrice(confirmAction.escrow.amount)}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button onClick={() => { executeConfirmedAction() }}
                className={`text-white ${confirmAction.action === 'release' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                Confirm {confirmAction.label}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
