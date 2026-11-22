'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  History,
  ListChecks,
  Loader2,
  Maximize2,
  Megaphone,
  MessageCircle,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
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

type RulesSettings = {
  last_speaker_guard: boolean
  greet_once: boolean
  require_intent: boolean
  intent_keywords: string[]
  quiet_hours: { enabled: boolean; start: string; end: string; urgent_exempt: boolean }
  typing_delay_seconds: number
  per_chat_rate_limit: { enabled: boolean; max_replies: number; window_minutes: number }
  global_rate_limit: { enabled: boolean; max_per_hour: number }
  ignore_forwarded: boolean
  ignore_status_replies: boolean
  keyword_allowlist: string[]
  keyword_blocklist: string[]
  handoff_after_misses: number
  groups_enabled: boolean
  groups_require_mention: boolean
  group_last_speaker_guard: boolean
  group_silent: boolean
  enabled_groups_only: boolean
  reply_probability: number
  circuit_breaker: { enabled: boolean; max_errors: number }
  dry_run: boolean
}

type StatusMode = 'off' | 'auto' | 'stats' | 'event' | 'random' | 'round_robin' | 'hybrid'

type StatusSettings = {
  mode: StatusMode
  interval_minutes: number
  daily_limit: number
  quiet_hours: { enabled: boolean; start: string; end: string }
  templates: Record<string, string>
  topics: { name?: string; body?: string; topic?: string }[]
  random_pool: { body: string; topic?: string }[]
  no_repeat_window: number
  event_hooks: Record<string, boolean>
  require_approval: boolean
}

type StatusHistory = {
  id: string | number
  mode: string
  topic: string | null
  body: string
  kind: string
  created_at: string
}

type Override = {
  id: string
  scope: string
  target: string
  settings: Record<string, unknown>
  enabled: boolean
  note: string | null
  updated_by: string | null
  updated_at: string
}

type StatusQueueItem = {
  id: string
  body: string
  channel: 'status' | 'group'
  status: string
  state: string
  scheduled_for: string
  sent_at: string | null
  expires_at: string | null
  expired: boolean
  target_jid: string | null
  template: string | null
  error: string | null
  created_at: string
}

type AuthState = {
  number: string | null
  me: string | null
  name: string | null
  connected: boolean
  registered: boolean
  uptime: number
  code: string | null
  codeAgeSeconds: number | null
  hasQr: boolean
  sessionPrefix: string
  error?: string
}

type Tab = 'overview' | 'chats' | 'urgent' | 'marketing' | 'groups' | 'rules' | 'statuses' | 'auth' | 'activity'

const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
  { id: 'overview', label: 'Control', icon: Bot },
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'urgent', label: 'Urgent', icon: AlertTriangle },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'rules', label: 'Rules', icon: ListChecks },
  { id: 'statuses', label: 'Statuses', icon: Radio },
  { id: 'auth', label: 'Auth', icon: Smartphone },
  { id: 'activity', label: 'Activity', icon: History },
]

const STATUS_MODES: { id: StatusMode; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No automatic statuses. Approved drafts still send.' },
  { id: 'auto', label: 'AI auto', blurb: 'Keep the existing AI house draft generator.' },
  { id: 'stats', label: 'Stats', blurb: 'Post live house, chat and urgent counts.' },
  { id: 'event', label: 'Events', blurb: 'Post when a house is listed or released.' },
  { id: 'random', label: 'Random', blurb: 'Cycle a pool without repeating recent posts.' },
  { id: 'round_robin', label: 'Round robin', blurb: 'Post topics in a fixed order.' },
  { id: 'hybrid', label: 'Hybrid', blurb: 'Mix stats, random and round robin.' },
]

const MODE_META: Record<BotMode, { label: string; short: string; dot: string; blurb: string }> = {
  autonomous: {
    label: 'Autonomous',
    short: 'No approvals',
    dot: 'bg-blue-600',
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
      return 'bg-blue-100 text-blue-900 dark:bg-blue-600/15 dark:text-blue-300'
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
  const [activityMigrationRequired, setActivityMigrationRequired] = useState(false)
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

  const [rules, setRules] = useState<RulesSettings | null>(null)
  const [ruleOverrides, setRuleOverrides] = useState<Override[]>([])
  const [statusSettings, setStatusSettings] = useState<StatusSettings | null>(null)
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([])
  const [statusQueue, setStatusQueue] = useState<StatusQueueItem[]>([])
  const [statusOverrides, setStatusOverrides] = useState<Override[]>([])
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [waitingForCode, setWaitingForCode] = useState(false)
  const [qrZoomed, setQrZoomed] = useState(false)
  const [newNumber, setNewNumber] = useState('')
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({})
  const [poolInput, setPoolInput] = useState('')
  const [topicsInput, setTopicsInput] = useState('')
  const [ruleOverrideScope, setRuleOverrideScope] = useState<'chat' | 'group'>('chat')
  const [ruleOverrideTarget, setRuleOverrideTarget] = useState('')
  const [statusOverrideScope, setStatusOverrideScope] = useState<'status' | 'group' | 'topic'>('status')
  const [statusOverrideTarget, setStatusOverrideTarget] = useState('status')
  const [overrideEditor, setOverrideEditor] = useState<Record<string, string>>({})
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({})
  const [newStatusBody, setNewStatusBody] = useState('')
  const [consoleMigrationRequired, setConsoleMigrationRequired] = useState(false)

  const showToast = useCallback((type: 'ok' | 'error', message: string) => {
    setToast({ type, message })
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const activityQuery = activityKind ? `?kind=${encodeURIComponent(activityKind)}` : ''
      const [controlRes, chatsRes, urgentRes, marketingRes, groupsRes, activityRes, rulesRes, statusRes, authRes] = await Promise.all([
        fetch('/api/admin/whatsapp/control'),
        fetch('/api/admin/whatsapp/chats'),
        fetch('/api/admin/whatsapp/urgent'),
        fetch('/api/admin/whatsapp/marketing'),
        fetch('/api/admin/whatsapp/groups'),
        fetch(`/api/admin/whatsapp/activity${activityQuery}`),
        fetch('/api/admin/whatsapp/rules'),
        fetch('/api/admin/whatsapp/status'),
        fetch('/api/admin/whatsapp/auth'),
      ])

      const [controlData, chatsData, urgentData, marketingData, groupsData, activityData, rulesData, statusData, authData] = await Promise.all([
        controlRes.json().catch(() => ({})),
        chatsRes.json().catch(() => ({})),
        urgentRes.json().catch(() => ({})),
        marketingRes.json().catch(() => ({})),
        groupsRes.json().catch(() => ({})),
        activityRes.json().catch(() => ({})),
        rulesRes.json().catch(() => ({})),
        statusRes.json().catch(() => ({})),
        authRes.json().catch(() => ({})),
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
        setActivityMigrationRequired(Boolean(activityData.migration_required))
      }
      if (rulesRes.ok && !rulesData.migration_required) {
        setRules(rulesData.settings ?? null)
        setRuleOverrides(rulesData.overrides ?? [])
      }
      if (statusRes.ok && !statusData.migration_required) {
        setStatusSettings(statusData.settings ?? null)
        setStatusHistory(statusData.history ?? [])
        setStatusQueue(statusData.queue ?? [])
        setStatusOverrides(statusData.overrides ?? [])
      }
      if (rulesData.migration_required || statusData.migration_required) {
        setConsoleMigrationRequired(true)
      } else {
        setConsoleMigrationRequired(false)
      }
      if (authRes.ok) setAuthState(authData)
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

  /*
   * A pairing code is issued by WhatsApp a few seconds after the worker
   * restarts its socket. Poll only the small auth endpoint while waiting so
   * the panel refreshes the code without a hard reload.
   */
  useEffect(() => {
    if (!waitingForCode) return
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(async () => {
      attempts += 1
      try {
        const res = await fetch('/api/admin/whatsapp/auth', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setAuthState(data)
          if (data?.code || attempts >= 30) setWaitingForCode(false)
        } else if (attempts >= 30) {
          setWaitingForCode(false)
        }
      } catch {
        if (!cancelled && attempts >= 30) setWaitingForCode(false)
      }
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [waitingForCode])

  useEffect(() => {
    if (!qrZoomed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQrZoomed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [qrZoomed])

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

  const patchRules = useCallback(
    async (patch: Partial<RulesSettings>, key = 'rules') => {
      setBusy(key)
      try {
        const res = await fetch('/api/admin/whatsapp/rules', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save rules.')
          return
        }
        setRules(data.settings ?? null)
        showToast('ok', 'Rules saved. Ase picks them up in a few seconds.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const patchStatus = useCallback(
    async (patch: Partial<StatusSettings>, key = 'status') => {
      setBusy(key)
      try {
        const res = await fetch('/api/admin/whatsapp/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save status settings.')
          return
        }
        setStatusSettings(data.settings ?? null)
        showToast('ok', 'Status settings saved.')
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [showToast]
  )

  const authAction = useCallback(
    async (action: 'code' | 'restart' | 'refresh_session' | 'switch', number?: string) => {
      const labels: Record<string, string> = {
        code: 'Request a new pairing code',
        restart: 'Restart the WhatsApp bot',
        refresh_session: 'Refresh the session',
        switch: 'Change the linked number',
      }
      if (action === 'refresh_session' && !window.confirm('This clears the saved pairing. You will need to link the phone again. Continue?')) return
      if (action === 'switch' && !window.confirm('Changing the number clears the current session. Continue?')) return
      setBusy(`auth-${action}`)
      try {
        const res = await fetch('/api/admin/whatsapp/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, number }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || `${labels[action]} failed.`)
          return
        }
        showToast('ok', `${labels[action]} requested.`)
        if (action === 'code' || action === 'restart' || action === 'refresh_session' || action === 'switch') {
          setAuthState((prev) => (prev ? { ...prev, code: null, codeAgeSeconds: null } : prev))
          setWaitingForCode(true)
        }
        void load()
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [load, showToast]
  )

  const saveOverride = useCallback(
    async (kind: 'rules' | 'status', body: Record<string, unknown>, key = 'override') => {
      setBusy(key)
      try {
        const res = await fetch(`/api/admin/whatsapp/${kind}/overrides`, {
          method: body.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not save override.')
          return
        }
        showToast('ok', 'Override saved. Ase applies it within a few seconds.')
        setOverrideEditor((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        void load()
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [load, showToast]
  )

  const deleteOverride = useCallback(
    async (kind: 'rules' | 'status', id: string) => {
      if (!window.confirm('Delete this override? The global setting will apply again.')) return
      setBusy(`delete-override-${id}`)
      try {
        const res = await fetch(`/api/admin/whatsapp/${kind}/overrides`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not delete override.')
          return
        }
        showToast('ok', 'Override deleted.')
        void load()
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [load, showToast]
  )

  const patchQueueItem = useCallback(
    async (id: string, action: 'update' | 'approve' | 'expire' | 'skip' | 'retry', extra: Record<string, unknown> = {}) => {
      setBusy(`queue-${action}-${id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/marketing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action, ...extra }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not update that status.')
          return
        }
        showToast('ok', 'Status updated.')
        setStatusDrafts((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        void load()
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [load, showToast]
  )

  const deleteQueueItem = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this status from the panel? This cannot be undone.')) return
      setBusy(`queue-delete-${id}`)
      try {
        const res = await fetch('/api/admin/whatsapp/marketing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          showToast('error', data?.error || 'Could not delete that status.')
          return
        }
        showToast('ok', 'Status removed.')
        void load()
      } catch {
        showToast('error', 'Network error.')
      } finally {
        setBusy(null)
      }
    },
    [load, showToast]
  )

  const createStatus = useCallback(async () => {
    if (!newStatusBody.trim()) return
    setBusy('new-status')
    try {
      const res = await fetch('/api/admin/whatsapp/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'status', action: 'create', body: newStatusBody.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Could not save the status.')
        return
      }
      setNewStatusBody('')
      showToast('ok', 'Status draft saved.')
      void load()
    } catch {
      showToast('error', 'Network error.')
    } finally {
      setBusy(null)
    }
  }, [load, newStatusBody, showToast])

  const resetWorkspace = useCallback(async () => {
    if (!window.confirm('Clear all WhatsApp chats, transcripts and groups collected by the old number?')) return
    if (!window.confirm('This cannot be undone. Continue only after the bot is paired to 254748275079.')) return
    setBusy('reset-workspace')
    try {
      const res = await fetch('/api/admin/whatsapp/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast('error', data?.error || 'Could not clear old data.')
        return
      }
      showToast('ok', 'Old chats and groups cleared.')
      void load()
    } catch {
      showToast('error', 'Network error.')
    } finally {
      setBusy(null)
    }
  }, [load, showToast])

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
              ? 'bg-blue-700 text-white'
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
            <span className="font-medium text-gray-700 dark:text-gray-300">+254 748 275 079</span>.
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
                            ? 'bg-blue-700 text-white'
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
                  ? 'bg-blue-700 text-white'
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
                  className="h-4 w-4 rounded border-gray-300 text-blue-700"
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
                    min={key.includes('interval') ? 5 : 1}
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
                  <CheckCircle2 className="h-4 w-4 text-blue-600" /> Allowlist
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
                      className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-600/15 dark:text-blue-300"
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
                  <a href={`https://wa.me/${item.phone}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
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
                    className="text-xs text-blue-700 hover:underline"
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
                      className="h-4 w-4 rounded border-gray-300 text-blue-700"
                    />
                    Enabled
                  </label>
                  <input
                    type="number"
                    min={5}
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

      {consoleMigrationRequired && (tab === 'rules' || tab === 'statuses') && (
        <div className="mt-5 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Run the console migration first.</span>
          <code className="text-xs">supabase/migration-whatsapp-console.sql</code>
        </div>
      )}

      {tab === 'rules' && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="font-semibold">How time is measured:</span> clock times are Nairobi time (EAT). Typing delay is in
            <span className="font-semibold"> seconds</span>; rate-limit windows and quiet hours are labelled. Durations like “50”
            below mean <span className="font-semibold">50 minutes</span>, never hours.
          </div>
          {!rules ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900">
              {loading ? 'Loading rules…' : 'Rules are unavailable.'}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Reply rules</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Ase stays quiet when a rule says so. Nothing here sends a message to the customer.
                  </p>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ['last_speaker_guard', 'Last speaker guard', 'Never answer if Ase spoke last in the chat.'],
                    ['greet_once', 'Greet once', 'Only greet a new chat once; real questions still get answers.'],
                    ['require_intent', 'Require intent', 'Answer only when a message matches the intent words below.'],
                    ['ignore_forwarded', 'Ignore forwarded', 'Skip forwarded messages.'],
                    ['ignore_status_replies', 'Ignore status replies', 'Do not answer replies to WhatsApp status.'],
                    ['groups_enabled', 'Enable group replies', 'Let Ase answer in groups at all (off by default).'],
                    ['groups_require_mention', 'Groups require mention', 'In groups, answer only when Ase is mentioned.'],
                    ['group_last_speaker_guard', 'Group last speaker guard', 'Do not double-message a group Ase just spoke in.'],
                    ['group_silent', 'Group silent', 'Never post in groups, even when enabled.'],
                    ['enabled_groups_only', 'Enabled groups only', 'Only answer in groups ticked on the Groups tab.'],
                    ['dry_run', 'Dry run', 'Log what Ase would send without actually sending it.'],
                  ] as const).map(([key, label, help]) => (
                    <label key={key} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={Boolean(rules[key])}
                        disabled={busy === `rule-${key}`}
                        onChange={(event) => void patchRules({ [key]: event.target.checked } as Partial<RulesSettings>, `rule-${key}`)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-slate-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                        <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{help}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Timing &amp; limits</h2>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Typing delay (seconds)</span>
                    <input type="number" min={0} max={60} defaultValue={rules.typing_delay_seconds}
                      onBlur={(e) => void patchRules({ typing_delay_seconds: Math.max(0, Number(e.target.value)) })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  </label>
                  <label className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Group reply chance (%)</span>
                    <input type="number" min={0} max={100} defaultValue={rules.reply_probability}
                      onBlur={(e) => void patchRules({ reply_probability: Math.min(100, Math.max(0, Number(e.target.value))) })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  </label>
                  {([
                    ['per_chat_rate_limit', 'max_replies', 'Max replies per chat (per rate window)'],
                    ['global_rate_limit', 'max_per_hour', 'Max replies per hour (all chats)'],
                    ['circuit_breaker', 'max_errors', 'Errors before pause'],
                  ] as const).map(([group, field, label]) => (
                    <label key={group} className="text-sm">
                      <span className="text-gray-600 dark:text-gray-400">{label}</span>
                      <input type="number" min={1} defaultValue={Number((rules[group] as Record<string, unknown> | undefined)?.[field] ?? 1)}
                        onBlur={(e) => void patchRules({ [group]: { ...(rules[group] as Record<string, unknown>), enabled: true, [field]: Math.max(1, Number(e.target.value)) } } as Partial<RulesSettings>)}
                        className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    </label>
                  ))}
                  <label className="text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Rate window (minutes)</span>
                    <input type="number" min={1} max={1440}
                      defaultValue={rules.per_chat_rate_limit?.window_minutes ?? 60}
                      onBlur={(e) => void patchRules({
                        per_chat_rate_limit: {
                          ...rules.per_chat_rate_limit,
                          enabled: true,
                          window_minutes: Math.min(1440, Math.max(1, Number(e.target.value))),
                        },
                      })}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">60 means one hour. This pairs with “Max replies per chat”.</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={Boolean(rules.quiet_hours?.enabled)}
                      onChange={(e) => void patchRules({ quiet_hours: { ...rules.quiet_hours, enabled: e.target.checked } })}
                      className="h-4 w-4" />
                    Quiet hours (Nairobi time)
                  </label>
                  <input type="time" value={rules.quiet_hours?.start || '22:00'}
                    onChange={(e) => void patchRules({ quiet_hours: { ...rules.quiet_hours, start: e.target.value } })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <span className="text-gray-400">to</span>
                  <input type="time" value={rules.quiet_hours?.end || '06:00'}
                    onChange={(e) => void patchRules({ quiet_hours: { ...rules.quiet_hours, end: e.target.value } })}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {([
                    ['intent_keywords', 'Intent words', 'Only reply when one of these appears.'],
                    ['keyword_allowlist', 'Keyword allowlist', 'Only reply to messages containing these.'],
                    ['keyword_blocklist', 'Keyword blocklist', 'Never reply to messages containing these.'],
                  ] as const).map(([key, label, help]) => (
                    <label key={key} className="text-sm">
                      <span className="block font-medium text-gray-900 dark:text-white">{label}</span>
                      <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{help}</span>
                      <textarea rows={3} defaultValue={(rules[key] || []).join(', ')}
                        onBlur={(e) => void patchRules({ [key]: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) } as Partial<RulesSettings>)}
                        placeholder="house, wifi, mover, escrow"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Chat &amp; group overrides</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Specific targets override the general rules above. Order: general → group → chat. Only the keys you set here are overridden.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-gray-100 p-4 dark:border-slate-800">
                  <select value={ruleOverrideScope}
                    onChange={(e) => setRuleOverrideScope(e.target.value as 'chat' | 'group')}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option value="chat">Chat / phone</option>
                    <option value="group">Group</option>
                  </select>
                  <input value={ruleOverrideTarget}
                    onChange={(e) => setRuleOverrideTarget(e.target.value)}
                    placeholder={ruleOverrideScope === 'group' ? '120363...@g.us' : '254748275079'}
                    className="min-w-56 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <Button size="sm" disabled={!ruleOverrideTarget.trim() || busy === 'override'}
                    onClick={() => {
                      void saveOverride('rules', {
                        scope: ruleOverrideScope,
                        target: ruleOverrideTarget.trim(),
                        settings: ruleOverrideScope === 'group'
                          ? { groups_enabled: true, groups_require_mention: true }
                          : { last_speaker_guard: true },
                      })
                      setRuleOverrideTarget('')
                    }}>
                    Add override
                  </Button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {ruleOverrides.map((row) => {
                    const settings = row.settings || {}
                    const quickKeys: { key: keyof RulesSettings; label: string }[] = [
                      { key: 'last_speaker_guard', label: 'Last speaker guard' },
                      { key: 'greet_once', label: 'Greet once' },
                      { key: 'groups_require_mention', label: 'Group mention' },
                      { key: 'group_silent', label: 'Group silent' },
                      { key: 'dry_run', label: 'Dry run' },
                    ]
                    return (
                      <div key={row.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.scope}: {row.target}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {row.enabled ? 'Active' : 'Paused'} · {row.note || 'No note'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={busy === `override-enabled-${row.id}`}
                              onClick={() => void saveOverride('rules', { id: row.id, enabled: !row.enabled }, `override-enabled-${row.id}`)}>
                              {row.enabled ? 'Pause' : 'Enable'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setOverrideEditor((prev) => ({
                              ...prev,
                              [row.id]: prev[row.id] ?? JSON.stringify(settings, null, 2),
                            }))}>
                              Edit JSON
                            </Button>
                            <Button size="sm" variant="danger" disabled={busy === `delete-override-${row.id}`}
                              onClick={() => void deleteOverride('rules', row.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {quickKeys.map(({ key, label }) => (
                            <label key={key} className="inline-flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                              <input type="checkbox" checked={Boolean(settings[key])}
                                onChange={(e) => void saveOverride('rules', { id: row.id, settings: { [key]: e.target.checked } }, `rule-ov-${row.id}-${key}`)}
                                className="h-3.5 w-3.5" />
                              {label}
                            </label>
                          ))}
                        </div>
                        {overrideEditor[row.id] !== undefined && (
                          <div className="mt-3">
                            <textarea rows={4} value={overrideEditor[row.id]}
                              onChange={(e) => setOverrideEditor((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" disabled={busy === `override-json-${row.id}`}
                                onClick={() => {
                                  try {
                                    const parsed = JSON.parse(overrideEditor[row.id])
                                    void saveOverride('rules', { id: row.id, settings: parsed }, `override-json-${row.id}`)
                                  } catch {
                                    showToast('error', 'That is not valid JSON.')
                                  }
                                }}>
                                Save JSON
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setOverrideEditor((prev) => {
                                const next = { ...prev }
                                delete next[row.id]
                                return next
                              })}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {ruleOverrides.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">No overrides yet. General rules apply everywhere.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'statuses' && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="font-semibold">Units:</span> “Interval” and “no-repeat window” are shown in minutes/counts as labelled;
            quiet hours use Nairobi clock time. WhatsApp statuses expire 24 hours after posting and then leave this panel.
          </div>
          <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-gray-200 p-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Status mode</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Posts still go through the approval queue unless approval is switched off.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {STATUS_MODES.map((mode) => (
                <button key={mode.id} type="button"
                  onClick={() => void patchStatus({ mode: mode.id }, `mode-${mode.id}`)}
                  title={mode.blurb}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${statusSettings?.mode === mode.id
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200'}`}>
                  {mode.label}
                </button>
              ))}
            </div>
            {statusSettings && (
              <p className="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400">
                {STATUS_MODES.find((m) => m.id === statusSettings.mode)?.blurb}
              </p>
            )}
          </div>

          {statusSettings && (
            <>
              <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Interval (minutes)</span>
                  <input type="number" min={5} max={1440} defaultValue={statusSettings.interval_minutes}
                    onBlur={(e) => void patchStatus({ interval_minutes: Math.min(1440, Math.max(5, Number(e.target.value))) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">50 = 50 minutes, not hours.</span>
                </label>
                <label className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Daily limit</span>
                  <input type="number" min={1} max={24} defaultValue={statusSettings.daily_limit}
                    onBlur={(e) => void patchStatus({ daily_limit: Math.min(24, Math.max(1, Number(e.target.value))) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                </label>
                <label className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">No-repeat window</span>
                  <input type="number" min={0} max={100} defaultValue={statusSettings.no_repeat_window}
                    onBlur={(e) => void patchStatus({ no_repeat_window: Math.min(100, Math.max(0, Number(e.target.value))) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={Boolean(statusSettings.require_approval)}
                    onChange={(e) => void patchStatus({ require_approval: e.target.checked })}
                    className="h-4 w-4" />
                  Require approval
                </label>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Event posts</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Queue a status when something happens on the site.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {(['new_listing', 'released', 'paid', 'booking_confirmed'] as const).map((hook) => (
                    <label key={hook} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={Boolean(statusSettings.event_hooks?.[hook])}
                        onChange={(e) => void patchStatus({ event_hooks: { ...statusSettings.event_hooks, [hook]: e.target.checked } })}
                        className="h-4 w-4" />
                      {hook.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Templates</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Placeholders: {'{title}'}, {'{location}'}, {'{rent}'}, {'{new_houses}'}, {'{released}'}, {'{chats}'}
                  </p>
                  <div className="mt-3 space-y-3">
                    {(['stats', 'new_listing', 'released'] as const).map((key) => (
                      <label key={key} className="block text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{key}</span>
                        <textarea rows={3} value={templateDrafts[key] ?? statusSettings.templates?.[key] ?? ''}
                          onChange={(e) => setTemplateDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={() => {
                            const value = templateDrafts[key]
                            if (value !== undefined && value !== (statusSettings.templates?.[key] ?? '')) {
                              void patchStatus({ templates: { ...statusSettings.templates, [key]: value } })
                            }
                          }}
                          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Random pool</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One status per line. Recent ones are skipped.</p>
                    <textarea rows={5} value={poolInput}
                      onChange={(e) => setPoolInput(e.target.value)}
                      placeholder={'AseHanta connects hunters with houses.\nList your house and earn with AseHanta.'}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPoolInput((statusSettings.random_pool || []).map((i) => i.body).join('\n'))}>
                        Load current
                      </Button>
                      <Button size="sm" onClick={() => void patchStatus({ random_pool: poolInput.split('\n').map((line) => line.trim()).filter(Boolean).map((body) => ({ body })) })}>
                        Save pool
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Round-robin topics</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">One topic per line, posted in order.</p>
                    <textarea rows={4} value={topicsInput}
                      onChange={(e) => setTopicsInput(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTopicsInput((statusSettings.topics || []).map((t) => t.name || t.topic || '').filter(Boolean).join('\n'))}>
                        Load current
                      </Button>
                      <Button size="sm" onClick={() => void patchStatus({ topics: topicsInput.split('\n').map((line) => line.trim()).filter(Boolean).map((name) => ({ name })) })}>
                        Save topics
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Status queue &amp; monitor</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Drafts, upcoming posts and posted statuses in one place. Expired statuses disappear automatically; deleting one also removes it from history.
                  </p>
                </div>

                <div className="grid gap-3 border-b border-gray-100 p-4 dark:border-slate-800 sm:grid-cols-3">
                  {([
                    ['upcoming', 'Upcoming', 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'],
                    ['posted', 'Posted', 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'],
                    ['draft', 'Drafts', 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'],
                  ] as const).map(([state, label, color]) => (
                    <div key={state} className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                      <p className={`mt-1 text-2xl font-bold ${color}`}>
                        {statusQueue.filter((item) => (state === 'posted' ? item.state === 'posted' : state === 'draft' ? item.state === 'draft' : item.state === 'upcoming' || item.state === 'due')).length}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="border-b border-gray-100 p-4 dark:border-slate-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New status</h4>
                  <textarea rows={3} value={newStatusBody}
                    onChange={(e) => setNewStatusBody(e.target.value)}
                    placeholder="Write a WhatsApp status…"
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Saved as a draft. WhatsApp statuses expire 24 hours after posting.</p>
                    <Button size="sm" disabled={!newStatusBody.trim() || busy === 'new-status'} onClick={() => void createStatus()}>
                      {busy === 'new-status' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Save draft
                    </Button>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {statusQueue.map((item) => (
                    <div key={item.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <textarea rows={2} value={statusDrafts[item.id] ?? item.body}
                            onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 hover:border-gray-300 focus:border-blue-500 dark:text-white dark:hover:border-slate-600" />
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-700 dark:bg-slate-800 dark:text-gray-300">{item.state}</span>
                            <span>Scheduled {when(item.scheduled_for)}</span>
                            {item.sent_at && <span>Posted {when(item.sent_at)}</span>}
                            {item.expires_at && <span>Expires {when(item.expires_at)}</span>}
                            {item.error && <span className="text-red-600 dark:text-red-400">{item.error}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(statusDrafts[item.id] ?? item.body) !== item.body && (
                            <Button size="sm" variant="outline" disabled={busy === `queue-update-${item.id}`}
                              onClick={() => void patchQueueItem(item.id, 'update', { body: statusDrafts[item.id] })}>
                              Save edit
                            </Button>
                          )}
                          {item.state !== 'posted' && (
                            <Button size="sm" disabled={busy === `queue-approve-${item.id}`}
                              onClick={() => void patchQueueItem(item.id, 'approve', {
                                body: statusDrafts[item.id] ?? item.body,
                                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                              })}>
                              Approve / schedule
                            </Button>
                          )}
                          {item.state === 'posted' && (
                            <Button size="sm" variant="outline" disabled={busy === `queue-expire-${item.id}`}
                              onClick={() => void patchQueueItem(item.id, 'expire')}>
                              Mark expired
                            </Button>
                          )}
                          <Button size="sm" variant="danger" disabled={busy === `queue-delete-${item.id}`}
                            onClick={() => void deleteQueueItem(item.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {statusQueue.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">No active statuses. Draft one above or let a status mode queue one.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Status overrides</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Override the general status mode for the main status channel, one group, or one topic. Order: general → topic → group → status.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-gray-100 p-4 dark:border-slate-800">
                  <select value={statusOverrideScope}
                    onChange={(e) => setStatusOverrideScope(e.target.value as 'status' | 'group' | 'topic')}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <option value="status">Status channel</option>
                    <option value="group">Group</option>
                    <option value="topic">Topic</option>
                  </select>
                  <input value={statusOverrideTarget}
                    onChange={(e) => setStatusOverrideTarget(e.target.value)}
                    disabled={statusOverrideScope === 'status'}
                    className="min-w-56 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <Button size="sm" disabled={busy === 'override' || (statusOverrideScope !== 'status' && !statusOverrideTarget.trim())}
                    onClick={() => void saveOverride('status', {
                      scope: statusOverrideScope,
                      target: statusOverrideScope === 'status' ? 'status' : statusOverrideTarget.trim(),
                      settings: statusOverrideScope === 'group' ? { mode: 'auto', interval_minutes: 60 } : { mode: 'off' },
                    })}>
                    Add override
                  </Button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {statusOverrides.map((row) => {
                    const settings = row.settings || {}
                    return (
                      <div key={row.id} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{row.scope}: {row.target}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Mode {String(settings.mode ?? 'inherited')} · interval {String(settings.interval_minutes ?? 'inherited')} min · {row.enabled ? 'active' : 'paused'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={busy === `override-enabled-${row.id}`}
                              onClick={() => void saveOverride('status', { id: row.id, enabled: !row.enabled }, `override-enabled-${row.id}`)}>
                              {row.enabled ? 'Pause' : 'Enable'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setOverrideEditor((prev) => ({
                              ...prev,
                              [row.id]: prev[row.id] ?? JSON.stringify(settings, null, 2),
                            }))}>
                              Edit JSON
                            </Button>
                            <Button size="sm" variant="danger" disabled={busy === `delete-override-${row.id}`}
                              onClick={() => void deleteOverride('status', row.id)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                        {overrideEditor[row.id] !== undefined && (
                          <div className="mt-3">
                            <textarea rows={4} value={overrideEditor[row.id]}
                              onChange={(e) => setOverrideEditor((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" disabled={busy === `override-json-${row.id}`}
                                onClick={() => {
                                  try {
                                    void saveOverride('status', { id: row.id, settings: JSON.parse(overrideEditor[row.id]) }, `override-json-${row.id}`)
                                  } catch {
                                    showToast('error', 'That is not valid JSON.')
                                  }
                                }}>
                                Save JSON
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setOverrideEditor((prev) => {
                                const next = { ...prev }
                                delete next[row.id]
                                return next
                              })}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {statusOverrides.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">No overrides yet. General status settings apply everywhere.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-gray-200 p-4 dark:border-slate-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Status history</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {statusHistory.slice(0, 20).map((row) => (
                    <div key={row.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="whitespace-pre-line text-sm text-gray-800 dark:text-gray-200">{row.body}</p>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{row.mode}</span>
                        {row.topic && <span>{row.topic}</span>}
                        <span>{when(row.created_at)}</span>
                      </div>
                    </div>
                  ))}
                  {statusHistory.length === 0 && (
                    <p className="p-4 text-sm text-gray-500">No statuses posted yet.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'auth' && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Linked WhatsApp account</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Session lives in Supabase. Restarting the worker does not require re-pairing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy === 'auth-code'}
                  onClick={() => void authAction('code')}>
                  {busy === 'auth-code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  New pairing code
                </Button>
                <Button size="sm" variant="outline" disabled={busy === 'auth-restart'}
                  onClick={() => void authAction('restart')}>
                  {busy === 'auth-restart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Restart bot
                </Button>
                <Button size="sm" variant="outline" disabled={busy === 'auth-refresh_session'}
                  onClick={() => void authAction('refresh_session')}>
                  Refresh session
                </Button>
                <Button size="sm" variant="danger" disabled={busy === 'reset-workspace'}
                  onClick={() => void resetWorkspace()}>
                  Clear old chats &amp; groups
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Configured number', authState?.number || '—'],
                ['Linked identity', authState?.me || '—'],
                ['Connection', authState?.connected ? 'Connected' : 'Disconnected'],
                ['Registered', authState?.registered ? 'Yes' : 'No'],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="mt-1 break-all text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
            {authState?.error && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{authState.error}</p>
            )}
            {authState?.me && !authState.me.includes('254748275079') && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
                This worker is still linked to <span className="font-semibold">{authState.me}</span>, not the official AseHanta number.
                Set the Render environment variable <code className="font-mono">WHATSAPP_PAIR_NUMBER=254748275079</code>, then request a new pairing code here.
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pairing code</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                WhatsApp → Settings → Linked devices → Link with phone number.
              </p>
              <p className="mt-4 text-center font-mono text-3xl font-bold tracking-widest text-gray-900 dark:text-white">
                {authState?.code || '—'}
              </p>
              {waitingForCode && !authState?.code && (
                <p className="mt-2 text-center text-xs text-amber-600 dark:text-amber-400">
                  Waiting for WhatsApp to issue the code… this updates automatically.
                </p>
              )}
              {authState?.code && (
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => void navigator.clipboard?.writeText(authState.code || '')}>
                    Copy code
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === 'auth-code'}
                    onClick={() => void authAction('code')}>
                    {busy === 'auth-code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    New code
                  </Button>
                </div>
              )}
              {authState?.codeAgeSeconds !== null && authState?.codeAgeSeconds !== undefined && (
                <p className="mt-2 text-center text-xs text-gray-500">Requested {authState.codeAgeSeconds}s ago</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">QR code</h3>
                <Button size="sm" variant="outline" onClick={() => setQrZoomed(true)}>
                  <Maximize2 className="h-4 w-4" />
                  Enlarge
                </Button>
              </div>
              <button type="button" onClick={() => setQrZoomed(true)}
                className="mt-3 block w-full" aria-label="Enlarge WhatsApp pairing QR">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/whatsapp/auth/qr?t=${Date.now()}`}
                  alt="WhatsApp pairing QR"
                  className="mx-auto h-48 w-48 rounded-lg border border-gray-200 bg-white p-2 dark:border-slate-700"
                />
              </button>
              <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                Tap the QR to enlarge it.
              </p>
            </div>
          </div>

          {qrZoomed && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              role="dialog" aria-modal="true" aria-label="Enlarged WhatsApp pairing QR"
              onClick={() => setQrZoomed(false)}>
              <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"
                onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">WhatsApp pairing QR</h3>
                  <Button size="sm" variant="ghost" aria-label="Close enlarged QR"
                    onClick={() => setQrZoomed(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/whatsapp/auth/qr?t=${Date.now()}`}
                    alt="WhatsApp pairing QR enlarged"
                    className="h-80 w-80 max-w-full rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 sm:h-96 sm:w-96"
                  />
                </div>
                <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
                  Scan with 0748275079 → WhatsApp → Settings → Linked devices. Press Escape to close.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Change linked number</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Digits only, country code included, e.g. 254748275079. This clears the current session.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={newNumber} onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="254748275079"
                className="min-w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              <Button size="sm" disabled={!newNumber || busy === 'auth-switch'}
                onClick={() => {
                  void authAction('switch', newNumber)
                  setNewNumber('')
                }}>
                {busy === 'auth-switch' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                Switch number
              </Button>
            </div>
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
            {activityMigrationRequired && (
              <div className="m-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  The activity diary is not enabled yet. Run{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5 text-xs dark:bg-amber-500/20">
                    supabase/migration-whatsapp-autonomy.sql
                  </code>{' '}
                  in the Supabase SQL Editor to start recording what Ase does.
                </p>
              </div>
            )}
            {activity.length === 0 && !activityMigrationRequired && (
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
                          : 'bg-[#1E3A8A] text-[#e9edef]'
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
