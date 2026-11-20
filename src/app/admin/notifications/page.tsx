'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Loader2, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import Button from '@/components/ui/Button'

type Audience = 'everyone' | 'hunter' | 'lister' | 'admin'

type NotificationRow = {
  id: string
  user_id: string | null
  role: string | null
  category: string
  title: string
  body: string | null
  link: string | null
  data: Record<string, unknown> | null
  is_broadcast: boolean | null
  read_at: string | null
  created_at: string
  audiences: Audience[]
  audience_label: string
}

type Counts = {
  total: number
  everyone: number
  hunter: number
  lister: number
  admin: number
  personal: number
}

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'hunter', label: 'Hunters' },
  { id: 'lister', label: 'Listers' },
  { id: 'admin', label: 'Admins' },
]

type Preference = {
  id: string
  label: string
  description: string
  channels: ('web' | 'whatsapp')[]
  audiences: Audience[]
  customised: boolean
  updated_at: string | null
  updated_by: string | null
}

type PreferenceEdit = { channels: ('web' | 'whatsapp')[]; audiences: Audience[] }

function when(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [filter, setFilter] = useState<'all' | 'everyone' | 'hunter' | 'lister' | 'admin' | 'personal'>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; message: string } | null>(null)
  const [edits, setEdits] = useState<Record<string, { title: string; body: string }>>({})
  const [prefs, setPrefs] = useState<Preference[]>([])
  const [prefEdits, setPrefEdits] = useState<Record<string, PreferenceEdit>>({})
  const [prefBusy, setPrefBusy] = useState<string | null>(null)
  const [prefsLoading, setPrefsLoading] = useState(true)

  const showToast = useCallback((type: 'ok' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = filter === 'all' ? '' : `?audience=${filter}`
      const res = await fetch(`/api/admin/notifications${query}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Could not load notifications.')
        return
      }
      setItems(data.items ?? [])
      setCounts(data.counts ?? null)
    } catch {
      showToast('error', 'Network error.')
    } finally {
      setLoading(false)
    }
  }, [filter, showToast])

  const loadPrefs = useCallback(async () => {
    setPrefsLoading(true)
    try {
      const res = await fetch('/api/admin/notification-preferences')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Could not load delivery preferences.')
        return
      }
      const rows = (data.items ?? []) as Preference[]
      setPrefs(rows)
      setPrefEdits(
        Object.fromEntries(
          rows.map((row) => [row.id, { channels: row.channels, audiences: row.audiences }])
        )
      )
    } catch {
      showToast('error', 'Network error.')
    } finally {
      setPrefsLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      await Promise.resolve()
      if (!cancelled) {
        void load()
        void loadPrefs()
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [load, loadPrefs])

  const retarget = useCallback(
    async (item: NotificationRow, audience: Audience) => {
      setBusy(`retarget-${item.id}`)
      try {
        const res = await fetch('/api/admin/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, audiences: [audience] }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not retarget that notification.')
          return
        }
        setItems((prev) => prev.map((row) => (row.id === item.id ? data.item : row)))
        showToast(
          'ok',
          audience === 'everyone'
            ? 'Notification now goes to everyone.'
            : `Notification now goes to ${audience}s.`
        )
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const save = useCallback(
    async (item: NotificationRow) => {
      const edit = edits[item.id]
      if (!edit) return
      setBusy(`save-${item.id}`)
      try {
        const res = await fetch('/api/admin/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, title: edit.title, body: edit.body }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save that notification.')
          return
        }
        setItems((prev) => prev.map((row) => (row.id === item.id ? data.item : row)))
        setEdits((prev) => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
        showToast('ok', 'Notification updated.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [edits, showToast]
  )

  const remove = useCallback(
    async (item: NotificationRow) => {
      if (!window.confirm('Delete this notification for everyone?')) return
      setBusy(`delete-${item.id}`)
      try {
        const res = await fetch('/api/admin/notifications', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not delete that notification.')
          return
        }
        setItems((prev) => prev.filter((row) => row.id !== item.id))
        showToast('ok', 'Notification deleted.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const savePref = useCallback(
    async (pref: Preference) => {
      const edit = prefEdits[pref.id]
      if (!edit) return
      if (!edit.channels.length || !edit.audiences.length) {
        showToast('error', 'Choose at least one channel and one audience.')
        return
      }
      setPrefBusy(pref.id)
      try {
        const res = await fetch('/api/admin/notification-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: pref.id,
            channels: edit.channels,
            audiences: edit.audiences,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save delivery preferences.')
          return
        }
        const rows = (data.items ?? []) as Preference[]
        if (rows.length) {
          setPrefs(rows)
          setPrefEdits(
            Object.fromEntries(
              rows.map((row) => [row.id, { channels: row.channels, audiences: row.audiences }])
            )
          )
        }
        showToast('ok', `${pref.label} preferences saved.`)
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setPrefBusy(null)
      }
    },
    [prefEdits, showToast]
  )

  const title = useMemo(() => {
    if (filter === 'all') return 'All notifications'
    if (filter === 'everyone') return 'Everyone'
    if (filter === 'personal') return 'Personal'
    return `${filter.charAt(0).toUpperCase()}${filter.slice(1)}s`
  }, [filter])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'ok' ? 'bg-blue-700 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Retarget a broadcast between everyone and a subgroup, edit its wording, or delete it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <section className="mt-6 rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery preferences</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Choose web (admin email + in-app), WhatsApp, or both for each notification type, and who sees the web copy.
          </p>
        </div>

        {prefsLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {prefs.map((pref) => {
              const edit = prefEdits[pref.id] ?? { channels: pref.channels, audiences: pref.audiences }
              const channel =
                edit.channels.length === 2 ? 'both' : edit.channels[0] || 'web'
              const dirty =
                edit.channels.join(',') !== pref.channels.join(',') ||
                edit.audiences.join(',') !== pref.audiences.join(',')

              return (
                <div
                  key={pref.id}
                  className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{pref.label}</p>
                      {pref.customised && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-600/15 dark:text-blue-300">
                          custom
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{pref.description}</p>
                  </div>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                    Channels
                    <select
                      value={channel}
                      onChange={(event) => {
                        const value = event.target.value as 'both' | 'web' | 'whatsapp'
                        setPrefEdits((prev) => ({
                          ...prev,
                          [pref.id]: {
                            ...edit,
                            channels: value === 'both' ? ['web', 'whatsapp'] : [value],
                          },
                        }))
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="both">Both</option>
                      <option value="web">Web only</option>
                      <option value="whatsapp">WhatsApp only</option>
                    </select>
                  </label>

                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Web audience</p>
                    <div className="flex flex-wrap gap-2">
                      {AUDIENCES.map((audience) => (
                        <label
                          key={audience.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:text-gray-200"
                        >
                          <input
                            type="checkbox"
                            checked={edit.audiences.includes(audience.id)}
                            onChange={() => {
                              const selected = edit.audiences.includes(audience.id)
                                ? edit.audiences.filter((item) => item !== audience.id)
                                : [...edit.audiences, audience.id]
                              if (!selected.length) return
                              setPrefEdits((prev) => ({
                                ...prev,
                                [pref.id]: { ...edit, audiences: selected },
                              }))
                            }}
                            className="accent-blue-700"
                          />
                          {audience.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => void savePref(pref)}
                    disabled={!dirty || prefBusy === pref.id}
                  >
                    {prefBusy === pref.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ['all', 'All', counts?.total ?? 0],
            ['everyone', 'Everyone', counts?.everyone ?? 0],
            ['hunter', 'Hunters', counts?.hunter ?? 0],
            ['lister', 'Listers', counts?.lister ?? 0],
            ['admin', 'Admins', counts?.admin ?? 0],
            ['personal', 'Personal', counts?.personal ?? 0],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              filter === id
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="h-4 w-4" />
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                filter === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-800'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </h2>

        {items.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400">
            No notifications in this group.
          </div>
        )}

        {items.map((item) => {
          const edit = edits[item.id] ?? { title: item.title, body: item.body ?? '' }
          const personal = Boolean(item.user_id)
          const current = personal ? 'personal' : item.audiences[0] ?? 'everyone'

          return (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-600/15 dark:text-blue-300">
                    <Bell className="h-3.5 w-3.5" />
                    {item.audience_label}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                    {item.category}
                  </span>
                  {personal && (
                    <span className="text-xs text-gray-400">personal message — not retargetable</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{when(item.created_at)}</span>
              </div>

              <div className="mt-3 grid gap-2">
                <input
                  value={edit.title}
                  onChange={(event) =>
                    setEdits((prev) => ({
                      ...prev,
                      [item.id]: { ...edit, title: event.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <textarea
                  value={edit.body}
                  onChange={(event) =>
                    setEdits((prev) => ({
                      ...prev,
                      [item.id]: { ...edit, body: event.target.value },
                    }))
                  }
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
                />
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {item.link}
                  </a>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!personal && (
                  <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    Send to
                    <select
                      value={current}
                      onChange={(event) => void retarget(item, event.target.value as Audience)}
                      disabled={busy === `retarget-${item.id}`}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {AUDIENCES.map((audience) => (
                        <option key={audience.id} value={audience.id}>
                          {audience.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void save(item)}
                    disabled={!edits[item.id] || busy === `save-${item.id}`}
                  >
                    {busy === `save-${item.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(item)}
                    disabled={busy === `delete-${item.id}`}
                  >
                    {busy === `delete-${item.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
