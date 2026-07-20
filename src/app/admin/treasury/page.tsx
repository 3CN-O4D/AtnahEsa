'use client'

import { useState, useEffect } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownLeft, RotateCcw, Banknote, RefreshCw, Wallet, TrendingUp, Clock, CheckCircle, XCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { formatPrice } from '@/lib/utils'
import type { EscrowHold, Transaction, Booking } from '@/types'

type EscrowWithDetails = EscrowHold & {
  booking?: Booking
  listing?: { title: string }
}

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

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
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
  }, [])

  const handleAction = async (escrowId: string, action: 'release' | 'refund') => {
    setActionLoading(escrowId)
    try {
      const res = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, escrow_id: escrowId }),
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

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></div>

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
        <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
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
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">In Escrow</span>
          </div>
          <p className="text-2xl font-bold">{stats.held}</p>
          <p className="text-sm text-gray-500">{formatPrice(stats.total_held_amount)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Released</span>
          </div>
          <p className="text-2xl font-bold">{stats.released}</p>
          <p className="text-sm text-gray-500">{formatPrice(stats.total_released_amount)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <RotateCcw className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Refunded</span>
          </div>
          <p className="text-2xl font-bold">{stats.refunded}</p>
          <p className="text-sm text-gray-500">{formatPrice(stats.total_refunded_amount)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Platform Revenue</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{formatPrice(stats.platform_revenue)}</p>
          <p className="text-sm text-gray-500">30% of {stats.released} releases</p>
        </div>
      </div>

      {/* Pending Escrows */}
      <div className="bg-white border rounded-xl mb-8">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Banknote className="w-4 h-4 text-blue-600" /> Pending Escrows ({stats.held})
          </h2>
        </div>
        {escrows.filter((e) => e.status === 'held').length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No pending escrows.</p>
        ) : (
          <div className="divide-y">
            {escrows.filter((e) => e.status === 'held').map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{e.listing?.title || 'Unknown listing'}</p>
                  <p className="text-xs text-gray-500">
                    {formatPrice(e.amount)} &middot; {new Date(e.created_at).toLocaleDateString()}
                    &middot; Held until {new Date(e.held_until).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => handleAction(e.id, 'release')} loading={actionLoading === e.id}
                    className="bg-green-600 hover:bg-green-700 text-white">
                    <ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Release
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(e.id, 'refund')} loading={actionLoading === e.id}
                    className="border-red-200 text-red-600 hover:bg-red-50">
                    <ArrowDownLeft className="w-3.5 h-3.5 mr-1" /> Refund 85%
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border rounded-xl">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-600" /> Recent Transactions
          </h2>
        </div>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left p-3 font-medium">Receipt</th>
                  <th className="text-left p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Message</th>
                  <th className="text-left p-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{tx.mpesa_receipt || tx.checkout_request_id?.slice(0, 16) || '-'}</td>
                    <td className="p-3 font-medium">{formatPrice(tx.amount)}</td>
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
                    <td className="p-3 text-gray-500 max-w-[200px] truncate">{tx.mpesa_message || '-'}</td>
                    <td className="p-3 text-gray-500 whitespace-nowrap">{new Date(tx.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
