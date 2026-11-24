'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatPrice } from '@/lib/utils'
import type { AdminPayment, AdminPaymentDirection, AdminPaymentStatus, AdminPaymentType, ListingStatus } from '@/types'

type HouseOption = {
  id: string
  title: string
  location: string | null
  status: ListingStatus
  price: number
  rent: number
}

type PaymentForm = {
  listing_id: string
  payer_name: string
  payer_phone: string
  amount: string
  direction: AdminPaymentDirection
  payment_type: AdminPaymentType
  payment_method: string
  mpesa_receipt: string
  mpesa_message: string
  status: AdminPaymentStatus
  paid_at: string
  notes: string
  listing_status: string
  taken_by_name: string
  listing_title: string
  listing_location: string
  listing_price: string
  listing_rent: string
  listing_description: string
}

type ToastFn = (type: 'success' | 'error', message: string) => void

const PAYMENT_TYPES: Array<{ value: AdminPaymentType; label: string; direction: AdminPaymentDirection }> = [
  { value: 'booking', label: 'House payment / booking', direction: 'in' },
  { value: 'escrow_hold', label: 'Escrow hold', direction: 'in' },
  { value: 'payout', label: 'Lister payout', direction: 'out' },
  { value: 'refund', label: 'Hunter refund', direction: 'out' },
  { value: 'commission', label: 'Commission', direction: 'in' },
  { value: 'other', label: 'Other', direction: 'in' },
]

const METHODS = ['mpesa', 'cash', 'bank_transfer', 'till', 'paywave', 'pos', 'other']
const STATUSES: AdminPaymentStatus[] = ['recorded', 'verified', 'failed', 'reversed']
const LISTING_STATUSES: ListingStatus[] = ['pending', 'published', 'booked', 'taken', 'rejected']

const emptyForm: PaymentForm = {
  listing_id: '',
  payer_name: '',
  payer_phone: '',
  amount: '',
  direction: 'in',
  payment_type: 'booking',
  payment_method: 'mpesa',
  mpesa_receipt: '',
  mpesa_message: '',
  status: 'recorded',
  paid_at: '',
  notes: '',
  listing_status: '',
  taken_by_name: '',
  listing_title: '',
  listing_location: '',
  listing_price: '',
  listing_rent: '',
  listing_description: '',
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function formFromPayment(payment: AdminPayment): PaymentForm {
  return {
    listing_id: payment.listing_id || '',
    payer_name: payment.payer_name || '',
    payer_phone: payment.payer_phone || '',
    amount: String(payment.amount ?? ''),
    direction: payment.direction,
    payment_type: payment.payment_type,
    payment_method: payment.payment_method || 'manual',
    mpesa_receipt: payment.mpesa_receipt || '',
    mpesa_message: payment.mpesa_message || '',
    status: payment.status,
    paid_at: toDateInput(payment.paid_at),
    notes: payment.notes || '',
    listing_status: '',
    taken_by_name: '',
    listing_title: '',
    listing_location: '',
    listing_price: '',
    listing_rent: '',
    listing_description: '',
  }
}

function buildPayload(form: PaymentForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    listing_id: form.listing_id || null,
    payer_name: form.payer_name.trim(),
    payer_phone: form.payer_phone.trim() || null,
    amount: Number(form.amount),
    direction: form.direction,
    payment_type: form.payment_type,
    payment_method: form.payment_method,
    mpesa_receipt: form.mpesa_receipt.trim() || null,
    mpesa_message: form.mpesa_message.trim() || null,
    status: form.status,
    paid_at: form.paid_at || null,
    notes: form.notes.trim(),
  }
  // Listing changes are opt-in: blank fields never overwrite a house in the
  // field with empty data.
  if (form.listing_status) payload.listing_status = form.listing_status
  if (form.taken_by_name.trim()) payload.taken_by_name = form.taken_by_name.trim()
  if (form.listing_title.trim()) payload.listing_title = form.listing_title.trim()
  if (form.listing_location.trim()) payload.listing_location = form.listing_location.trim()
  if (form.listing_price !== '') payload.listing_price = Number(form.listing_price)
  if (form.listing_rent !== '') payload.listing_rent = Number(form.listing_rent)
  if (form.listing_description.trim()) payload.listing_description = form.listing_description.trim()
  return payload
}

export default function TreasuryPayments({ onToast }: { onToast?: ToastFn }) {
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [totals, setTotals] = useState({ count: 0, in: 0, out: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [houseSearch, setHouseSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminPayment | null>(null)
  const [form, setForm] = useState<PaymentForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AdminPayment | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const notify = useCallback<ToastFn>(
    (type, message) => {
      if (onToast) onToast(type, message)
      else setError(type === 'error' ? message : '')
    },
    [onToast]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [paymentRes, houseRes] = await Promise.all([
        fetch('/api/admin/payments', { cache: 'no-store' }),
        fetch('/api/admin/listings', { cache: 'no-store' }),
      ])
      const paymentData = await paymentRes.json().catch(() => ({}))
      const houseData = await houseRes.json().catch(() => [])
      if (!paymentRes.ok) throw new Error(paymentData?.error || 'Payments could not load')
      setPayments(Array.isArray(paymentData.payments) ? paymentData.payments : [])
      setTotals(paymentData.totals ?? { count: 0, in: 0, out: 0 })
      setHouses(Array.isArray(houseData) ? houseData : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payments could not load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredHouses = useMemo(() => {
    const query = houseSearch.trim().toLowerCase()
    if (!query) return houses
    return houses.filter((house) =>
      `${house.title} ${house.location || ''} ${house.status} ${house.id}`.toLowerCase().includes(query)
    )
  }, [houses, houseSearch])

  const selectedHouse = houses.find((house) => house.id === form.listing_id) ?? null

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setHouseSearch('')
    setModalOpen(true)
  }

  const openEdit = (payment: AdminPayment) => {
    setEditing(payment)
    setForm(formFromPayment(payment))
    setFormError('')
    setHouseSearch(payment.listing?.title || '')
    setModalOpen(true)
  }

  const updateForm = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const savePayment = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetch(editing ? `/api/admin/payments/${editing.id}` : '/api/admin/payments', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(form)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(data?.error || 'Could not save this payment.')
        return
      }
      notify(data.warning ? 'error' : 'success', data.warning || (editing ? 'Payment updated' : 'Payment recorded'))
      if (!data.warning) {
        setModalOpen(false)
        await load()
      }
    } catch {
      setFormError('Network error while saving the payment.')
    } finally {
      setSaving(false)
    }
  }

  const deletePayment = async () => {
    if (!deleteTarget || deleteConfirm !== 'DELETE') return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/payments/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notify('error', data?.error || 'Could not delete this payment.')
        return
      }
      notify('success', 'Payment deleted')
      setDeleteTarget(null)
      setDeleteConfirm('')
      await load()
    } catch {
      notify('error', 'Network error while deleting the payment.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">
            <Receipt className="h-3.5 w-3.5" /> Payment ledger
          </p>
          <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">Admin payments</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Off-website payments and escrow movements. Pick a house to also update its field listing.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-blue-700 text-white hover:bg-blue-800">
          <Plus className="mr-1 h-4 w-4" /> Add payment
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Records</p>
          <p className="text-xl font-extrabold text-gray-900 dark:text-white">{totals.count}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            <ArrowDownLeft className="h-3 w-3" /> Money in
          </p>
          <p className="text-xl font-extrabold text-emerald-700">{formatPrice(totals.in)}</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <ArrowUpRight className="h-3 w-3" /> Money out
          </p>
          <p className="text-xl font-extrabold text-amber-700">{formatPrice(totals.out)}</p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error} <button type="button" onClick={() => void load()} className="underline">Retry</button>
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading payments…</p>
      ) : payments.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-slate-700">
          No payments recorded yet. Use <strong>Add payment</strong> for cash, M-Pesa sent to admin, or field escrow movements.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500 dark:border-slate-700">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">House</th>
                <th className="py-2 pr-3">Payer</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3">Method / status</th>
                <th className="py-2 pr-3">Receipt</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {payments.map((payment) => (
                <tr key={payment.id} className="text-gray-700 dark:text-gray-200">
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    {new Date(payment.paid_at || payment.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${
                      payment.direction === 'out' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {PAYMENT_TYPES.find((type) => type.value === payment.payment_type)?.label || payment.payment_type}
                    </span>
                  </td>
                  <td className="max-w-[220px] py-2.5 pr-3">
                    {payment.listing?.title || <span className="text-gray-400">Unassigned</span>}
                    {payment.listing?.location && <span className="block text-[10px] text-gray-400">{payment.listing.location}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {payment.payer_name || '—'}
                    {payment.payer_phone && <span className="block text-[10px] text-gray-400">{payment.payer_phone}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold whitespace-nowrap">{formatPrice(payment.amount)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="capitalize">{payment.payment_method}</span>
                    <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      payment.status === 'verified' ? 'bg-emerald-100 text-emerald-700' :
                      payment.status === 'failed' || payment.status === 'reversed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px]">{payment.mpesa_receipt || '—'}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => openEdit(payment)} className="rounded p-1 text-blue-700 hover:bg-blue-50" aria-label="Edit payment">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => { setDeleteTarget(payment); setDeleteConfirm('') }} className="rounded p-1 text-red-600 hover:bg-red-50" aria-label="Delete payment">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit payment */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit payment' : 'Record a payment'} size="xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
              House <span className="font-normal text-gray-400">(optional — also update this listing)</span>
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={houseSearch}
                onChange={(event) => setHouseSearch(event.target.value)}
                placeholder="Filter by title, area or status"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <select
              value={form.listing_id}
              onChange={(event) => updateForm('listing_id', event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">No house attached</option>
              {filteredHouses.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.title} — {house.location || 'No area'} — {house.status} — KES {house.price || house.rent}
                </option>
              ))}
            </select>
            {selectedHouse && (
              <p className="mt-1 text-[11px] text-gray-500">
                Selected: {selectedHouse.title} · {selectedHouse.status} · KES {selectedHouse.rent}/mo
              </p>
            )}
          </div>

          <Input label="Payer name" value={form.payer_name} onChange={(e) => updateForm('payer_name', e.target.value)} placeholder="Who paid?" />
          <Input label="Payer phone" value={form.payer_phone} onChange={(e) => updateForm('payer_phone', e.target.value)} placeholder="07…" />
          <Input label="Amount (KES)" type="number" min="1" value={form.amount} onChange={(e) => updateForm('amount', e.target.value)} placeholder="15000" />
          <Input label="Date paid" type="datetime-local" value={form.paid_at} onChange={(e) => updateForm('paid_at', e.target.value)} />

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Payment type</label>
            <select
              value={form.payment_type}
              onChange={(event) => {
                const next = PAYMENT_TYPES.find((type) => type.value === event.target.value)
                setForm((current) => ({
                  ...current,
                  payment_type: (next?.value ?? 'other') as AdminPaymentType,
                  direction: next?.direction ?? current.direction,
                }))
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {PAYMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Direction</label>
            <select
              value={form.direction}
              onChange={(event) => updateForm('direction', event.target.value as AdminPaymentDirection)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="in">Money in (received / held)</option>
              <option value="out">Money out (paid / refunded)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Method</label>
            <select
              value={form.payment_method}
              onChange={(event) => updateForm('payment_method', event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm capitalize dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Record status</label>
            <select
              value={form.status}
              onChange={(event) => updateForm('status', event.target.value as AdminPaymentStatus)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm capitalize dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <Input label="M-Pesa receipt" value={form.mpesa_receipt} onChange={(e) => updateForm('mpesa_receipt', e.target.value)} placeholder="QF…" />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">M-Pesa message / proof</label>
            <textarea
              value={form.mpesa_message}
              onChange={(event) => updateForm('mpesa_message', event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="Paste the confirmation SMS when available"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="Where the payment was made, who collected it, why a refund was given…"
            />
          </div>
        </div>

        {form.listing_id && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="mb-2 text-xs font-bold text-blue-800 dark:text-blue-300">Update the selected house</p>
            <p className="mb-3 text-[11px] text-gray-500">Only fields you fill below are changed. Leave them blank to keep the listing exactly as it is.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Listing status</label>
                <select
                  value={form.listing_status}
                  onChange={(event) => updateForm('listing_status', event.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Leave unchanged</option>
                  {LISTING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <Input label="Taken by" value={form.taken_by_name} onChange={(e) => updateForm('taken_by_name', e.target.value)} placeholder="Hunter's name" />
              <Input label="New title" value={form.listing_title} onChange={(e) => updateForm('listing_title', e.target.value)} placeholder="Leave blank to keep title" />
              <Input label="New area" value={form.listing_location} onChange={(e) => updateForm('listing_location', e.target.value)} placeholder="Leave blank to keep area" />
              <Input label="New sale price" type="number" min="0" value={form.listing_price} onChange={(e) => updateForm('listing_price', e.target.value)} placeholder="Leave blank to keep" />
              <Input label="New monthly rent" type="number" min="0" value={form.listing_rent} onChange={(e) => updateForm('listing_rent', e.target.value)} placeholder="Leave blank to keep" />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">New description</label>
                <textarea
                  value={form.listing_description}
                  onChange={(event) => updateForm('listing_description', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  placeholder="Leave blank to keep the current description"
                />
              </div>
            </div>
          </div>
        )}

        {formError && <p className="mt-3 text-sm font-medium text-red-600">{formError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={() => void savePayment()} loading={saving} className="bg-blue-700 text-white hover:bg-blue-800">
            {editing ? 'Save changes' : 'Record payment'}
          </Button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete payment" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          This hides <strong>{deleteTarget?.payer_name || 'this payment'}</strong> ({deleteTarget ? formatPrice(deleteTarget.amount) : ''}) from the ledger.
          The audit trail is kept on the server.
        </p>
        <Input
          label="Type DELETE to confirm"
          value={deleteConfirm}
          onChange={(event) => setDeleteConfirm(event.target.value)}
          placeholder="DELETE"
          className="mt-3 uppercase"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            onClick={() => void deletePayment()}
            loading={deleting}
            disabled={deleteConfirm !== 'DELETE'}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete payment
          </Button>
        </div>
      </Modal>
    </section>
  )
}
