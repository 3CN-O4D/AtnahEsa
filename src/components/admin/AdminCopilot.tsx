'use client'

import { useEffect, useRef, useState } from 'react'
import { Bot, Check, ChevronDown, Loader2, RefreshCw, Send, ShieldCheck, Sparkles, X } from 'lucide-react'

interface PendingAction {
  token: string
  tool: string
  summary: string
  args: Record<string, unknown>
  expires_at: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  pending?: PendingAction
}

interface CopilotResponse {
  reply?: string
  pending_action?: PendingAction | null
  refresh?: boolean
  quickReplies?: string[]
  error?: string
}

const QUICK_PROMPTS = [
  'Platform stats',
  'Which listings are pending approval?',
  'Show open complaints',
  'Treasury summary',
  'Booking reviews awaiting a decision',
  'Find a user by phone or email',
]

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function renderInline(text: string, keyPrefix: string) {
  // Minimal safe formatting: **bold** and `code`. No raw HTML.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={`${keyPrefix}-${index}`} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[11px] text-slate-800 dark:bg-slate-700 dark:text-slate-100">
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>
  })
}

function MessageBody({ content }: { content: string }) {
  return (
    <div className="space-y-1.5">
      {content.split('\n').map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-1.5" />
        return (
          <p key={index} className="whitespace-pre-wrap break-words leading-relaxed">
            {renderInline(line, `l-${index}`)}
          </p>
        )
      })}
    </div>
  )
}

function argPreview(args: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(args)
    .filter(([key]) => key !== 'token')
    .slice(0, 10)
    .map(([key, value]) => {
      let display: string
      if (Array.isArray(value)) display = value.map(String).join(', ')
      else if (value && typeof value === 'object') display = JSON.stringify(value)
      else display = String(value ?? '')
      if (display.length > 140) display = `${display.slice(0, 140)}…`
      return [key.replace(/_/g, ' '), display]
    })
}

export default function AdminCopilot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: id(),
      role: 'assistant',
      content:
        'Hi admin 👋 I can read and change anything in the admin console.\n\nAsk me for stats, users, listings, bookings, treasury, complaints or services. Anything that changes data will show a confirm card before it runs.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>(QUICK_PROMPTS.slice(0, 4))
  const [error, setError] = useState('')
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, open, busy])

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => textareaRef.current?.focus(), 150)
      return () => clearTimeout(timer)
    }
  }, [open])

  const pending = [...messages].reverse().find((m) => m.pending)?.pending

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    setError('')
    setBusy(true)
    const userMessage: Message = { id: id(), role: 'user', content: trimmed }
    const history = messages
      .filter((m) => !m.pending)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMessage])
    setInput('')

    try {
      const res = await fetch('/api/admin/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })
      const data = (await res.json().catch(() => ({}))) as CopilotResponse
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)

      setMessages((prev) => [
        ...prev,
        {
          id: id(),
          role: 'assistant',
          content: data.reply || 'No response.',
          pending: data.pending_action || undefined,
        },
      ])
      if (Array.isArray(data.quickReplies) && data.quickReplies.length) setQuickReplies(data.quickReplies)
      if (data.refresh) setNeedsRefresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the copilot.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmAction(action: PendingAction) {
    if (busy) return
    setBusy(true)
    setError('')
    setShowDetails(false)

    setMessages((prev) => [
      ...prev.map((m) => (m.pending?.token === action.token ? { ...m, pending: undefined } : m)),
      { id: id(), role: 'user', content: `Confirm: ${action.summary}` },
    ])

    try {
      const res = await fetch('/api/admin/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation_token: action.token }),
      })
      const data = (await res.json().catch(() => ({}))) as CopilotResponse
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)

      setMessages((prev) => [
        ...prev,
        { id: id(), role: 'assistant', content: data.reply || 'Done.' },
      ])
      if (data.refresh) setNeedsRefresh(true)
      if (Array.isArray(data.quickReplies) && data.quickReplies.length) setQuickReplies(data.quickReplies)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  function cancelAction(action: PendingAction) {
    setShowDetails(false)
    setMessages((prev) => [
      ...prev.map((m) => (m.pending?.token === action.token ? { ...m, pending: undefined } : m)),
      { id: id(), role: 'assistant', content: 'Cancelled. Nothing was changed.' },
    ])
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-left shadow-2xl shadow-blue-950/30 ring-1 ring-blue-600/40 transition hover:-translate-y-0.5 hover:ring-blue-400"
          aria-label="Open admin copilot"
        >
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-sky-700 text-slate-950 shadow-lg shadow-blue-600/30">
            <Bot className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-blue-400" />
          </span>
          <span className="pr-1">
            <span className="block text-sm font-extrabold tracking-tight text-white">Ase Admin</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
              Copilot · admin only
            </span>
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-x-3 bottom-3 z-[60] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[400px] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-950 px-4 py-3 dark:border-slate-700">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-sky-700 text-slate-950">
              <ShieldCheck className="h-4.5 w-4.5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-blue-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-extrabold tracking-tight text-white">
                Ase Admin <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              </p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
                Full admin access · every action confirmed
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Close admin copilot"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {needsRefresh && (
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Data changed. Reload to refresh the dashboard.</span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-amber-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-700"
              >
                Reload
              </button>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-slate-950/40">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] shadow-sm ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-blue-700 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  <MessageBody content={message.content} />

                  {message.pending && (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                        Confirm action
                      </p>
                      <p className="mt-1 text-[13px] font-semibold leading-snug">{message.pending.summary}</p>

                      <button
                        type="button"
                        onClick={() => setShowDetails((v) => !v)}
                        className="mt-2 flex w-full items-center justify-between rounded-lg border border-amber-200 bg-white/60 px-2 py-1.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-slate-900/40 dark:text-amber-200"
                      >
                        <span>{showDetails ? 'Hide details' : 'Show details'}</span>
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                      </button>

                      {showDetails && (
                        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg bg-white/70 p-2 text-[11px] dark:bg-slate-950/40">
                          {argPreview(message.pending.args).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="w-24 shrink-0 font-semibold capitalize text-amber-800 dark:text-amber-300">{key}</span>
                              <span className="min-w-0 flex-1 break-words text-amber-950 dark:text-amber-100">{value || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => confirmAction(message.pending!)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-blue-800 disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Confirm
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cancelAction(message.pending!)}
                          className="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-500/30 dark:bg-slate-900 dark:text-amber-200"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700/80 dark:text-amber-300/70">
                        Nothing runs until you tap Confirm. This request expires in 10 minutes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600" />
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {quickReplies.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy || Boolean(pending)}
                  onClick={() => send(prompt)}
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-blue-300"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(input)
                  }
                }}
                rows={1}
                disabled={busy || Boolean(pending)}
                placeholder={pending ? 'Confirm or cancel the action above…' : 'Ask Ase Admin anything…'}
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900"
              />
              <button
                type="button"
                disabled={busy || Boolean(pending) || !input.trim()}
                onClick={() => void send(input)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition hover:bg-blue-800 disabled:bg-slate-300 dark:disabled:bg-slate-700"
                aria-label="Send message"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] font-medium text-slate-400 dark:text-slate-500">
              Admin-only · every change is confirmed and audited
            </p>
          </div>
        </div>
      )}
    </>
  )
}
