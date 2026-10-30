'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bug,
  MessageSquareWarning,
  CreditCard,
  Home,
  UserRound,
  Lightbulb,
  HelpCircle,
  RefreshCw,
  Loader2,
  Search,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Save,
} from 'lucide-react'
import Button from '@/components/ui/Button'

type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type Priority = 'low' | 'normal' | 'high' | 'urgent'

type Complaint = {
  id: string
  user_id: string | null
  name: string
  email: string
  phone: string
  category: string
  subject: string
  message: string
  status: ComplaintStatus
  priority: Priority
  admin_note: string
  created_at: string
  updated_at: string
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Bug }> = {
  bug: { label: 'Bug', icon: Bug },
  complaint: { label: 'Complaint', icon: MessageSquareWarning },
  payment: { label: 'Payment', icon: CreditCard },
  listing: { label: 'Listing', icon: Home },
  account: { label: 'Account', icon: UserRound },
  feature: { label: 'Feature', icon: Lightbulb },
  other: { label: 'Other', icon: HelpCircle },
}

const STATUS_META: Record<ComplaintStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300' },
  resolved: { label: 'Resolved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300' },
}

const PRIORITY_META: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300',
  normal: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

export default function AdminComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ComplaintStatus>('all')
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/complaints')
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        setError(data?.error || 'Could not load complaints')
        return
      }
      setComplaints(Array.isArray(data) ? data : [])
    } catch {
      setError('Network error while loading complaints')
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

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const patch = async (id: string, body: Record<string, string>) => {
    setSavingId(id)
    try {
      const res = await fetch(`/api/admin/complaints/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast(data?.error || 'Update failed')
        return
      }
      setComplaints((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)))
      setToast('Complaint updated')
    } catch {
      setToast('Network error while updating')
    } finally {
      setSavingId(null)
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return complaints.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (!needle) return true
      return [c.subject, c.message, c.name, c.email, c.category].some((value) =>
        String(value || '').toLowerCase().includes(needle)
      )
    })
  }, [complaints, statusFilter, search])

  const counts = useMemo(
    () => ({
      all: complaints.length,
      open: complaints.filter((c) => c.status === 'open').length,
      in_progress: complaints.filter((c) => c.status === 'in_progress').length,
      resolved: complaints.filter((c) => c.status === 'resolved').length,
      closed: complaints.filter((c) => c.status === 'closed').length,
      urgent: complaints.filter((c) => c.priority === 'urgent' && c.status !== 'resolved' && c.status !== 'closed').length,
    }),
    [complaints]
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
            Support desk
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
            Complaints &amp; bug reports
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {counts.open} open · {counts.in_progress} in progress · {counts.urgent} urgent
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Refresh
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatusFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === value
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300'
            }`}
          >
            {value === 'all' ? 'All' : STATUS_META[value].label}
            <span className="ml-1.5 opacity-60">{counts[value]}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reports…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && complaints.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 py-16 text-gray-500">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          <p className="text-sm">Loading reports…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" />
          <h2 className="mt-3 text-base font-bold text-gray-900 dark:text-white">Nothing here</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {complaints.length === 0 ? 'No complaints have been filed yet.' : 'No reports match these filters.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {filtered.map((complaint) => {
            const meta = CATEGORY_META[complaint.category] || CATEGORY_META.other
            const Icon = meta.icon
            const note = notes[complaint.id] ?? complaint.admin_note
            return (
              <article
                key={complaint.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-800">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">{complaint.subject}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_META[complaint.status].className}`}>
                        {STATUS_META[complaint.status].label}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_META[complaint.priority]}`}>
                        {complaint.priority}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-slate-800 dark:text-gray-400">
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {complaint.name} · {complaint.email}
                      {complaint.phone ? ` · ${complaint.phone}` : ''} · {new Date(complaint.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={complaint.status}
                      disabled={savingId === complaint.id}
                      onChange={(e) => void patch(complaint.id, { status: e.target.value })}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select
                      value={complaint.priority}
                      disabled={savingId === complaint.id}
                      onChange={(e) => void patch(complaint.id, { priority: e.target.value })}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.3fr_0.7fr]">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {complaint.message}
                  </p>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Internal note
                    </label>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [complaint.id]: e.target.value }))}
                      placeholder="What did we do about it?"
                      className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                    />
                    <button
                      type="button"
                      disabled={savingId === complaint.id}
                      onClick={() => void patch(complaint.id, { admin_note: note })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-gray-200"
                    >
                      {savingId === complaint.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save note
                    </button>
                    {complaint.priority === 'urgent' && complaint.status !== 'resolved' && (
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" /> Urgent — respond first
                      </p>
                    )}
                    {complaint.status === 'in_progress' && (
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        <Clock3 className="h-3.5 w-3.5" /> Being worked on
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xl animate-scaleIn dark:bg-white dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  )
}
