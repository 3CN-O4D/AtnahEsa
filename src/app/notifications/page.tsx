'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell, Megaphone, Home, CreditCard, Link2, Calendar, Building2,
  CheckCheck, ChevronRight, Loader2, Send, User as UserIcon, Shield,
  Trash2, Users, Timer,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SkeletonBooking } from '@/components/ui/Skeleton'
import { signInUrl, currentPathWithSearch } from '@/lib/auth-redirect'

type NotificationItem = {
  id: string
  user_id: string | null
  role: string
  category: string
  title: string
  body: string
  link: string
  data: Record<string, unknown>
  is_broadcast: boolean
  read_at: string | null
  created_at: string
  audiences?: string[]
  expires_at?: string | null
}

type Filter = 'all' | 'unread'

const CATEGORY_META: Record<string, { label: string; className: string; icon: typeof Bell }> = {
  advert: { label: 'Advert', className: 'bg-purple-100 text-purple-700', icon: Megaphone },
  new_house: { label: 'New House', className: 'bg-blue-100 text-blue-700', icon: Home },
  transaction: { label: 'Transaction', className: 'bg-green-100 text-green-700', icon: CreditCard },
  linking: { label: 'Linking', className: 'bg-amber-100 text-amber-700', icon: Link2 },
  booking: { label: 'Booking', className: 'bg-cyan-100 text-cyan-700', icon: Calendar },
  listing: { label: 'Listing', className: 'bg-indigo-100 text-indigo-700', icon: Building2 },
  system: { label: 'System', className: 'bg-gray-100 text-gray-700', icon: Bell },
}

const AUDIENCE_OPTIONS = [
  { id: 'hunter', label: 'Hunters' },
  { id: 'lister', label: 'Listers' },
  { id: 'admin', label: 'Admins' },
] as const

const AUDIENCE_LABELS: Record<string, string> = {
  everyone: 'Everyone',
  hunter: 'Hunters',
  lister: 'Listers',
  admin: 'Admins',
}

const DURATION_OPTIONS = [
  { value: '0', label: 'No expiry (until deleted)' },
  { value: '6', label: '6 hours' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationsPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string[]>([])

  const [composeOpen, setComposeOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)
  const [form, setForm] = useState({
    category: 'advert',
    audiences: ['everyone'] as string[],
    durationHours: '0',
    title: '',
    body: '',
    link: '',
  })
  const [deleting, setDeleting] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push(signInUrl(currentPathWithSearch())); return }
      setUser(data.user)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
      setIsAdmin(profile?.role === 'admin')
    })
    load()
  }, [router, load])

  const visible = filter === 'unread'
    ? notifications.filter((n) => !n.read_at)
    : notifications

  const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id)

  async function markRead(ids: string[]) {
    if (!ids.length) return
    setMarking((prev) => [...prev, ...ids])
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
      )
    } finally {
      setMarking((prev) => prev.filter((id) => !ids.includes(id)))
    }
  }

  async function markAllRead() {
    if (!unreadIds.length) return
    setMarking(unreadIds)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    } finally {
      setMarking([])
    }
  }

  const toggleAudience = (id: string) => {
    setForm((prev) => {
      if (id === 'everyone') return { ...prev, audiences: ['everyone'] }
      const current = prev.audiences.includes('everyone')
        ? []
        : prev.audiences.filter((a) => a !== 'everyone')
      const next = current.includes(id)
        ? current.filter((a) => a !== id)
        : [...current, id]
      return { ...prev, audiences: next.length ? next : ['everyone'] }
    })
  }

  async function deleteNotification(item: NotificationItem, forEveryone = false) {
    const label = forEveryone ? 'this notification for everyone' : 'this notification'
    if (!window.confirm(`Delete ${label}?`)) return
    setDeleting((prev) => [...prev, item.id])
    try {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [item.id], global: forEveryone }),
      })
      if (!res.ok) return
      setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    } finally {
      setDeleting((prev) => prev.filter((id) => id !== item.id))
    }
  }

  async function sendNotification(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setSendError('Title is required'); return }
    setSending(true)
    setSendError('')
    setSendSuccess(false)
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          audiences: form.audiences,
          duration_hours: Number(form.durationHours) || 0,
          title: form.title,
          body: form.body,
          link: form.link,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSendError(data.error || 'Failed to send'); return }
      setSendSuccess(true)
      setForm({ ...form, title: '', body: '', link: '' })
      load()
    } finally {
      setSending(false)
    }
  }

  if (loading) return <SkeletonBooking />

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-blue-600" /> Notifications
        </h1>
        {isAdmin && (
          <button
            onClick={() => setComposeOpen(!composeOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            {composeOpen ? <ChevronRight className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
            {composeOpen ? 'Close' : 'Send'}
          </button>
        )}
      </div>

      {isAdmin && composeOpen && (
        <form onSubmit={sendNotification} className="bg-white dark:bg-slate-800 border dark:border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-600" /> Send Notification
          </h2>
          {sendError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3">{sendError}</div>
          )}
          {sendSuccess && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm rounded-lg px-4 py-3">Notification sent.</div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="advert">Advert</option>
                <option value="new_house">New House</option>
                <option value="transaction">Transaction</option>
                <option value="linking">Linking details</option>
                <option value="booking">Booking</option>
                <option value="listing">Listing</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Duration</span>
              <select
                value={form.durationHours}
                onChange={(e) => setForm({ ...form, durationHours: e.target.value })}
                className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
              <Users className="w-3.5 h-3.5" /> Audience — pick one or combine
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleAudience('everyone')}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  form.audiences.includes('everyone')
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 text-gray-600 hover:border-blue-400 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                Everyone
              </button>
              {AUDIENCE_OPTIONS.map((option) => {
                const active = form.audiences.includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleAudience(option.id)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-600 hover:border-blue-400 dark:border-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              {form.audiences.includes('everyone')
                ? 'Every signed-in user will see this notification.'
                : `Only ${form.audiences.map((a) => AUDIENCE_LABELS[a] || a).join(' + ')} will see this notification.`}
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. New houses available in Ruiru"
              className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Message</span>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Optional details..."
              rows={3}
              className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Link (optional)</span>
            <input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="e.g. /listings/abc-123"
              className="mt-1 w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </form>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 text-sm font-medium ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-1.5 text-sm font-medium ${filter === 'unread' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-gray-600'}`}
          >
            Unread {unreadIds.length > 0 && `(${unreadIds.length})`}
          </button>
        </div>
        {unreadIds.length > 0 && (
          <button onClick={markAllRead} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-600 mb-1">No notifications</h2>
          <p className="text-sm text-gray-400">New alerts for adverts, houses, transactions and linking will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((n) => {
            const meta = CATEGORY_META[n.category] || CATEGORY_META.system
            const Icon = meta.icon
            const unread = !n.read_at
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (!unread) return
                  markRead([n.id])
                  if (n.link) router.push(n.link)
                }}
                className={`bg-white dark:bg-slate-800 border rounded-xl overflow-hidden transition-colors ${unread ? 'border-blue-200 dark:border-blue-800 cursor-pointer hover:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
              >
                <div className="flex gap-3 p-4">
                  <div className={`w-9 h-9 flex-shrink-0 rounded-full ${meta.className} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.className}`}>{meta.label}</span>
                        {(n.audiences?.length ? n.audiences : [n.role || 'everyone']).map((audience) => (
                          <span key={audience} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {AUDIENCE_LABELS[audience] || audience}
                          </span>
                        ))}
                        {n.expires_at && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <Timer className="w-3 h-3" /> Until {new Date(n.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                        <button
                          type="button"
                          title="Delete this notification"
                          aria-label="Delete this notification"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void deleteNotification(n)
                          }}
                          disabled={deleting.includes(n.id)}
                          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/30"
                        >
                          {deleting.includes(n.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        {isAdmin && n.is_broadcast && n.user_id === null && (
                          <button
                            type="button"
                            title="Delete for every user"
                            aria-label="Delete this notification for every user"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              void deleteNotification(n, true)
                            }}
                            disabled={deleting.includes(n.id)}
                            className="rounded-md border border-red-200 p-1 text-red-500 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900/60 dark:hover:bg-red-900/30"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className={`text-sm mt-1 ${unread ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>{n.title}</p>
                    {n.body && <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>}
                    {n.link && (
                      <span className="text-xs text-blue-600 mt-1 inline-flex items-center gap-1">
                        <ChevronRight className="w-3 h-3" /> Open
                      </span>
                    )}
                  </div>
                  {unread && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
