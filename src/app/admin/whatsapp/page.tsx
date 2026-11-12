'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Megaphone,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import Button from '@/components/ui/Button'

type BotMode = 'autonomous' | 'regular' | 'off'

type Control = {
  mode: BotMode
  allowlist: string[]
  blocklist: string[]
  marketing_enabled: boolean
  require_approval: boolean
  status_interval_minutes: number
  group_interval_minutes: number
  status_daily_limit: number
  group_daily_limit: number
  last_status_at: string | null
  last_group_at: string | null
  updated_by: string | null
  updated_at: string | null
}

type Stats = {
  chats: number
  humanChats: number
  messagesToday: number
  pendingMarketing: number
  urgentOpen: number
}

type Chat = {
  wa_jid: string
  phone: string | null
  profile_name: string | null
  ai_enabled: boolean
  handoff_at: string | null
  updated_at: string | null
}

type Urgent = {
  id: string
  phone: string | null
  name: string | null
  topic: string | null
  subject: string | null
  message: string
  priority: string
  status: 'open' | 'acknowledged' | 'resolved'
  created_at: string
}

type Marketing = {
  id: string
  channel: 'status' | 'group'
  target_jid: string | null
  body: string
  image_url: string | null
  listing_id: string | null
  template: string | null
  status: 'draft' | 'approved' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'skipped'
  scheduled_for: string
  sent_at: string | null
  error: string | null
  meta: { headline?: string; subline?: string; source?: string; topic?: string } | null
  created_at: string
}

type Group = {
  jid: string
  name: string | null
  enabled: boolean
  cadence_minutes: number
  last_posted_at: string | null
  member_count: number | null
}

type Transcript = {
  found: boolean
  phone: string
  jid: string | null
  name: string | null
  count: number
  messages: { role: 'user' | 'assistant' | 'admin' | 'system'; body: string; at: string | null }[]
}

type Activity = {
  id: string | number
  kind: string
  subject: string | null
  detail: Record<string, unknown> | null
  actor: string
  created_at: string
}

type Tab = 'overview' | 'chats' | 'urgent' | 'marketing' | 'groups' | 'activity'

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'overview', label: 'Control', icon: Bot },
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'urgent', label: 'Urgent', icon: AlertTriangle },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'activity', label: 'Activity', icon: History },
]

const MODE_META: Record<BotMode, { label: string; short: string; dot: string; blurb: string }> = {
  autonomous: {
    label: 'Autonomous',
    short: 'No approvals',
    dot: 'bg-emerald-500',
    blurb: 'Ase answers, posts and acts on its own. Nothing waits for a human.',
  },
  regular: {
    label: 'Regular',
    short: 'Approvals required',
    dot: 'bg-sky-500',
    blurb: 'Ase answers chats; marketing posts wait for an admin to approve them.',
  },
  off: {
    label: 'Off',
    short: 'AI silent',
    dot: 'bg-amber-500',
    blurb: 'Ase stays silent. Each chat gets one holding message and the team is pinged.',
  },
}

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

function statusClass(status: Marketing['status']) {
  switch (status) {
    case 'sent':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
    case 'approved':
    case 'scheduled':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'
    case 'sending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
    case 'skipped':
      return 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
    default:
      return 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'
  }
}

export default function AdminWhatsAppPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [control, setControl] = useState<Control | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [urgent, setUrgent] = useState<Urgent[]>([])
  const [marketing, setMarketing] = useState<Marketing[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [activityKinds, setActivityKinds] = useState<string[]>([])
  const [activityKind, setActivityKind] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; message: string } | null>(null)

  const [phoneInput, setPhoneInput] = useState('')
  const [chatSearch, setChatSearch] = useState('')
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)

  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({})
  const [draftGroup, setDraftGroup] = useState('')

  const showToast = useCallback((type: 'ok' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const activityQuery = activityKind ? `?kind=${encodeURIComponent(activityKind)}` : ''
      const [controlRes, chatsRes, urgentRes, marketingRes, groupsRes, activityRes] = await Promise.all([
        fetch('/api/admin/whatsapp/control'),
        fetch('/api/admin/whatsapp/chats'),
        fetch('/api/admin/whatsapp/urgent'),
        fetch('/api/admin/whatsapp/marketing'),
        fetch('/api/admin/whatsapp/groups'),
        fetch(`/api/admin/whatsapp/activity${activityQuery}`),
      ])

      const [controlData, chatsData, urgentData, marketingData, groupsData, activityData] = await Promise.all([
        controlRes.json().catch(() => ({})),
        chatsRes.json().catch(() => ({})),
        urgentRes.json().catch(() => ({})),
        marketingRes.json().catch(() => ({})),
        groupsRes.json().catch(() => ({})),
        activityRes.json().catch(() => ({})),
      ])

      if (controlRes.ok) {
        setControl(controlData.control ?? null)
        setStats(controlData.stats ?? null)
      }
      if (chatsRes.ok) setChats(chatsData.chats ?? [])
      if (urgentRes.ok) setUrgent(urgentData.items ?? [])
      if (marketingRes.ok) setMarketing(marketingData.items ?? [])
      if (groupsRes.ok) setGroups(groupsData.groups ?? [])
      if (activityRes.ok) {
        setActivity(activityData.items ?? [])
        setActivityKinds(activityData.kinds ?? [])
      }
    } catch {
      showToast('error', 'Could not load WhatsApp controls.')
    } finally {
      setLoading(false)
    }
  }, [activityKind, showToast])

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      await Promise.resolve()
      if (!cancelled) void load()
    }
    void tick()
    const timer = window.setInterval(() => {
      if (!cancelled) void load()
    }, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [load])

  const patchControl = useCallback(
    async (body: Record<string, unknown>, key = 'control') => {
      setBusy(key)
      try {
        const res = await fetch('/api/admin/whatsapp/control', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save.')
          return
        }
        if (data.control) setControl(data.control)
        showToast('ok', 'Saved.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const toggleChat = useCallback(
    async (chat: Chat) => {
      setBusy(`chat-${chat.wa_jid}`)
      try {
        const res = await fetch('/api/admin/whatsapp/control', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: chat.wa_jid, phone: chat.phone, ai_enabled: !chat.ai_enabled }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not update chat.')
          return
        }
        setChats((prev) =>
          prev.map((item) =>
            item.wa_jid === chat.wa_jid ? { ...item, ai_enabled: !chat.ai_enabled, handoff_at: null } : item
          )
        )
        showToast('ok', chat.ai_enabled ? 'Ase is silent in that chat.' : 'Ase is back in that chat.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const openTranscript = useCallback(
    async (chat: Chat) => {
      setSelectedChat(chat)
      setTranscript(null)
      setTranscriptLoading(true)
      try {
        const params = new URLSearchParams()
        if (chat.phone) params.set('phone', chat.phone)
        if (chat.wa_jid) params.set('jid', chat.wa_jid)
        params.set('format', 'json')
        const res = await fetch(`/api/admin/whatsapp/transcript?${params.toString()}`)
        const data = await res.json().catch(() => null)
        if (!res.ok || !data) {
          showToast('error', data?.error || 'Could not load transcript.')
          return
        }
        setTranscript(data)
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setTranscriptLoading(false)
      }
    },
    [showToast]
  )

  const patchUrgent = useCallback(
    async (id: string, status: Urgent['status']) => {
      setBusy(`urgent-${id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/urgent', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not update.')
          return
        }
        setUrgent((prev) => prev.map((item) => (item.id === id ? data.item : item)))
        showToast('ok', status === 'resolved' ? 'Marked resolved.' : 'Acknowledged.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const generateDraft = useCallback(
    async (channel: 'status' | 'group') => {
      if (channel === 'group' && !draftGroup) {
        showToast('error', 'Enable and choose a group first.')
        return
      }
      setBusy(`generate-${channel}`)
      try {
        const res = await fetch('/api/admin/whatsapp/marketing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            target_jid: channel === 'group' ? draftGroup : null,
            topic: 'auto',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not generate a draft.')
          return
        }
        setMarketing((prev) => [data.item, ...prev])
        setTab('marketing')
        showToast('ok', 'AI draft ready — review it below.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [draftGroup, showToast]
  )

  const patchMarketing = useCallback(
    async (id: string, action: string, extra: Record<string, unknown> = {}) => {
      setBusy(`marketing-${id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/marketing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action, ...extra }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not update the post.')
          return
        }
        setMarketing((prev) => prev.map((item) => (item.id === id ? data.item : item)))
        showToast('ok', action === 'send' || action === 'approve' ? 'Approved — the worker will send it shortly.' : 'Updated.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const patchGroup = useCallback(
    async (group: Group, patch: Record<string, unknown>) => {
      setBusy(`group-${group.jid}`)
      try {
        const res = await fetch('/api/admin/whatsapp/groups', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jid: group.jid, ...patch }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not update the group.')
          return
        }
        setGroups((prev) => prev.map((item) => (item.jid === group.jid ? data.group : item)))
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const syncGroupList = useCallback(async () => {
    setBusy('groups-sync')
    try {
      const res = await fetch('/api/admin/whatsapp/groups', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Could not sync groups.')
        return
      }
      setGroups(data.groups ?? [])
      showToast('ok', `Synced ${data.synced ?? 0} group(s) from WhatsApp.`)
    } catch {
      showToast('error', 'Network error.')
    } finally {
      setBusy(null)
    }
  }, [showToast])

  const deleteMarketing = useCallback(
    async (item: Marketing) => {
      if (!window.confirm('Delete this post from the panel? The WhatsApp status itself cannot be recalled.')) {
        return
      }
      setBusy(`delete-marketing-${item.id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/marketing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not delete the post.')
          return
        }
        setMarketing((prev) => prev.filter((row) => row.id !== item.id))
        showToast('ok', 'Post removed from the panel.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const deleteActivity = useCallback(
    async (item: Activity) => {
      setBusy(`delete-activity-${item.id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/activity', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not delete that entry.')
          return
        }
        setActivity((prev) => prev.filter((row) => row.id !== item.id))
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const filteredChats = useMemo(() => {
    const q = chatSearch.trim().toLowerCase()
    if (!q) return chats
    return chats.filter((chat) =>
      `${chat.phone ?? ''} ${chat.profile_name ?? ''} ${chat.wa_jid}`.toLowerCase().includes(q)
    )
  }, [chatSearch, chats])

  const enabledGroups = groups.filter((group) => group.enabled)
  const openUrgent = urgent.filter((item) => item.status === 'open')
  const pendingMarketing = marketing.filter((item) =>
    ['draft', 'approved', 'scheduled', 'sending'].includes(item.status)
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">WhatsApp control</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Ase replies, hands over to humans, escalates urgent items and markets houses — from {' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">+254 791 410 625</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          {control && (
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 dark:border-slate-700">
              {(
                [
                  { mode: 'autonomous' as BotMode, label: 'Autonomous', icon: Sparkles },
                  { mode: 'regular' as BotMode, label: 'Regular', icon: Play },
                  { mode: 'off' as BotMode, label: 'Off', icon: Pause },
                ] as const
              ).map((option) => {
                const Icon = option.icon
                const active = control.mode === option.mode
                return (
                  <button
                    key={option.mode}
                    onClick={() => void patchControl({ mode: option.mode }, 'mode')}
                    disabled={busy === 'mode'}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? option.mode === 'off'
                          ? 'bg-amber-500 text-white'
                          : option.mode === 'autonomous'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-sky-600 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800'
                    }`}
                    title={MODE_META[option.mode].blurb}
                  >
                    {busy === 'mode' && active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                    {option.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          const badge =
            item.id === 'urgent' ? openUrgent.length : item.id === 'marketing' ? pendingMarketing.length : 0
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {badge > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Bot status
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">Bot mode</div>
                <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                  <span className={`h-2.5 w-2.5 rounded-full ${MODE_META[control?.mode ?? 'regular'].dot}`} />
                  {MODE_META[control?.mode ?? 'regular'].label}
                  <span className="text-xs font-normal text-gray-500">
                    {MODE_META[control?.mode ?? 'regular'].short}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {MODE_META[control?.mode ?? 'regular'].blurb}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">Marketing</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {control?.marketing_enabled ? 'On' : 'Off'}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {control?.mode === 'autonomous' ? 'auto-send' : 'approval required'}
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">Chats</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {stats?.chats ?? 0}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {stats?.humanChats ?? 0} with a human
                  </span>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">Messages today</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {stats?.messagesToday ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(control?.marketing_enabled)}
                  onChange={(event) => void patchControl({ marketing_enabled: event.target.checked }, 'marketing')}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
                Marketing enabled
              </label>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                {control?.mode === 'autonomous'
                  ? 'Autonomous — posts send immediately'
                  : 'Approval required — drafts wait for you'}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['status_interval_minutes', 'Status interval (min)'],
                  ['status_daily_limit', 'Max statuses / day'],
                  ['group_interval_minutes', 'Group interval (min)'],
                  ['group_daily_limit', 'Max group posts / day'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{label}</span>
                  <input
                    type="number"
                    defaultValue={control?.[key] ?? 0}
                    onBlur={(event) =>
                      void patchControl({ [key]: Number(event.target.value) }, key)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Last status: {when(control?.last_status_at ?? null)} · last group post:{' '}
              {when(control?.last_group_at ?? null)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Allow / block
            </h2>
            <div className="mt-3 flex gap-2">
              <input
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="254712345678"
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <Button
                size="sm"
                onClick={() => {
                  void patchControl({ list_action: 'allow-add', phone: phoneInput }, 'list')
                  setPhoneInput('')
                }}
                disabled={!phoneInput.trim()}
              >
                Allow
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  void patchControl({ list_action: 'block-add', phone: phoneInput }, 'list')
                  setPhoneInput('')
                }}
                disabled={!phoneInput.trim()}
              >
                Block
              </Button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Allowlist
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {control?.allowlist?.length
                    ? 'Only these numbers get AI replies.'
                    : 'Empty — AI replies to everyone.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(control?.allowlist ?? []).map((phone) => (
                    <button
                      key={phone}
                      onClick={() => void patchControl({ list_action: 'allow-remove', phone }, 'list')}
                      className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      title="Remove"
                    >
                      +{phone} ×
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
                  <ShieldAlert className="h-4 w-4 text-red-500" /> Blocklist
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(control?.blocklist ?? []).length === 0 && (
                    <span className="text-xs text-gray-400">Nobody blocked.</span>
                  )}
                  {(control?.blocklist ?? []).map((phone) => (
                    <button
                      key={phone}
                      onClick={() => void patchControl({ list_action: 'block-remove', phone }, 'list')}
                      className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      title="Unblock"
                    >
                      +{phone} ×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'chats' && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-gray-200 p-4 dark:border-slate-800">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              placeholder="Search phone or name"
              className="w-full bg-transparent text-sm text-gray-900 outline-none dark:text-white"
            />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filteredChats.length === 0 && (
              <p className="p-6 text-sm text-gray-500 dark:text-gray-400">No conversations yet.</p>
            )}
            {filteredChats.map((chat) => (
              <div key={chat.wa_jid} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <UserRound className="h-4 w-4 text-gray-400" />
                    {chat.profile_name || 'Unknown'}
                    <span className="text-xs font-normal text-gray-500">+{chat.phone || '—'}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {chat.ai_enabled ? '🤖 Ase replying' : '🙋 Human handling'} · updated {when(chat.updated_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void openTranscript(chat)}>
                    <FileText className="h-4 w-4" /> Transcript
                  </Button>
                  <Button
                    size="sm"
                    variant={chat.ai_enabled ? 'danger' : 'primary'}
                    onClick={() => void toggleChat(chat)}
                    disabled={busy === `chat-${chat.wa_jid}`}
                  >
                    {chat.ai_enabled ? 'Take over' : 'Give to Ase'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'urgent' && (
        <div className="mt-5 space-y-3">
          {urgent.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400">
              No escalations yet.
            </div>
          )}
          {urgent.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.priority === 'urgent'
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    }`}
                  >
                    {item.priority}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {item.subject || item.topic || 'Escalation'}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{when(item.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{item.message}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>{item.name || 'Unknown'}</span>
                {item.phone && (
                  <a href={`https://wa.me/${item.phone}`} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                    +{item.phone}
                  </a>
                )}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium dark:bg-slate-800">{item.status}</span>
                <div className="ml-auto flex gap-2">
                  {item.status === 'open' && (
                    <Button size="sm" variant="outline" onClick={() => void patchUrgent(item.id, 'acknowledged')}>
                      Acknowledge
                    </Button>
                  )}
                  {item.status !== 'resolved' && (
                    <Button size="sm" onClick={() => void patchUrgent(item.id, 'resolved')}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'marketing' && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">AI wording</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The model writes from real listing data, then you approve. Nothing is sent automatically while approval is on.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => void generateDraft('status')}
                disabled={busy === 'generate-status'}
                size="sm"
              >
                {busy === 'generate-status' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                New status draft
              </Button>
              <select
                value={draftGroup}
                onChange={(event) => setDraftGroup(event.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Choose an enabled group…</option>
                {enabledGroups.map((group) => (
                  <option key={group.jid} value={group.jid}>
                    {group.name || group.jid}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => void generateDraft('group')}
                disabled={busy === 'generate-group' || !draftGroup}
                size="sm"
                variant="outline"
              >
                {busy === 'generate-group' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                New group draft
              </Button>
            </div>
          </div>

          {marketing.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-400">
              No marketing posts yet.
            </div>
          )}

          {marketing.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(item.status)}`}>
                    {item.status}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {item.channel}
                  </span>
                  {item.meta?.source && (
                    <span className="text-xs text-gray-400">· {item.meta.source}</span>
                  )}
                  {item.target_jid && (
                    <span className="max-w-[16rem] truncate text-xs text-gray-400">· {item.target_jid}</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{when(item.created_at)}</span>
              </div>

              <textarea
                defaultValue={item.body}
                onChange={(event) =>
                  setDraftEdits((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
                rows={7}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
              />

              {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.image_url && (
                  <a
                    href={item.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    Listing photo
                  </a>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void patchMarketing(item.id, 'update', {
                        body: draftEdits[item.id] ?? item.body,
                      })
                      setDraftEdits((prev) => {
                        const next = { ...prev }
                        delete next[item.id]
                        return next
                      })
                    }}
                    disabled={!draftEdits[item.id]}
                  >
                    Save edits
                  </Button>
                  {(item.status === 'draft' || item.status === 'failed') && (
                    <Button
                      size="sm"
                      onClick={() => void patchMarketing(item.id, item.status === 'failed' ? 'retry' : 'approve')}
                      disabled={busy === `marketing-${item.id}`}
                    >
                      {item.status === 'failed' ? 'Retry' : 'Approve'}
                    </Button>
                  )}
                  {item.status === 'approved' && (
                    <span className="text-xs text-gray-500">Queued for the next worker tick</span>
                  )}
                  {['draft', 'approved', 'scheduled', 'failed'].includes(item.status) && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void patchMarketing(item.id, 'skip')}
                    >
                      Skip
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteMarketing(item)}
                    disabled={busy === `delete-marketing-${item.id}`}
                    title="Remove this post from the panel"
                  >
                    {busy === `delete-marketing-${item.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'groups' && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Group marketing</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Groups are discovered when the worker connects. Only enable groups where promotion is welcome — group blasting is the fastest way to lose the number.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void syncGroupList()} disabled={busy === 'groups-sync'}>
              {busy === 'groups-sync' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync from WhatsApp
            </Button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {groups.length === 0 && (
              <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
                No groups discovered yet. Tap “Sync from WhatsApp” once the worker is connected.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.jid} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900 dark:text-white">
                    {group.name || group.jid}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {group.member_count ?? '?'} members · last post {when(group.last_posted_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={group.enabled}
                      onChange={(event) => void patchGroup(group, { enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                    />
                    Enabled
                  </label>
                  <input
                    type="number"
                    defaultValue={group.cadence_minutes}
                    onBlur={(event) => void patchGroup(group, { cadence_minutes: Number(event.target.value) })}
                    className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    title="Minutes between posts"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ase activity</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Every status, group post, call and control change. The bot checks this diary before repeating a house.
              </p>
            </div>
            <select
              value={activityKind}
              onChange={(event) => setActivityKind(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All activity</option>
              {activityKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {activity.length === 0 && (
              <p className="p-6 text-sm text-gray-500 dark:text-gray-400">Nothing recorded yet.</p>
            )}
            {activity.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-slate-800 dark:text-gray-300">
                      {item.kind.replace(/_/g, ' ')}
                    </span>
                    {item.subject && (
                      <span className="max-w-[24rem] truncate text-xs text-gray-500">{item.subject}</span>
                    )}
                    <span className="text-xs text-gray-400">{when(item.created_at)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">{item.actor}</span>
                  </div>
                  {item.detail && Object.keys(item.detail).length > 0 && (
                    <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                      {JSON.stringify(item.detail, null, 2)}
                    </pre>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void deleteActivity(item)}
                  disabled={busy === `delete-activity-${item.id}`}
                >
                  {busy === `delete-activity-${item.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-slate-800">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {selectedChat.profile_name || 'Conversation'}
                </h2>
                <p className="text-xs text-gray-500">
                  +{selectedChat.phone || '—'} · {transcript?.count ?? 0} messages
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/whatsapp/transcript?${
                    selectedChat.phone ? `phone=${selectedChat.phone}` : `jid=${encodeURIComponent(selectedChat.wa_jid)}`
                  }&format=html`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
                >
                  Printable / screenshot view
                </a>
                <button
                  onClick={() => {
                    setSelectedChat(null)
                    setTranscript(null)
                  }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#0b141a] p-4">
              {transcriptLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading transcript…
                </div>
              )}
              {!transcriptLoading && transcript && !transcript.found && (
                <p className="text-sm text-gray-400">No messages stored for this chat yet.</p>
              )}
              {!transcriptLoading &&
                transcript?.messages.map((message, index) => (
                  <div
                    key={`${message.at}-${index}`}
                    className={`mb-2 flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-xl px-3 py-2 text-sm ${
                        message.role === 'user'
                          ? 'bg-[#202c33] text-[#e9edef]'
                          : 'bg-[#005c4b] text-[#e9edef]'
                      }`}
                    >
                      <div className="mb-1 flex justify-between gap-3 text-[10px] text-gray-400">
                        <span>
                          {message.role === 'user'
                            ? 'Customer'
                            : message.role === 'assistant'
                              ? 'Ase'
                              : message.role}
                        </span>
                        <span>{when(message.at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap break-words">{message.body}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
