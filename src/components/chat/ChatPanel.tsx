'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { Home as HomeIcon, Send, X, ExternalLink, Sparkles, ArrowLeft, Camera, Loader2 } from 'lucide-react'
import { buildOpeningMessages } from '@/lib/chat/messages'
import { splitBubbles } from '@/lib/chat/bubbles'
import { emptyState } from '@/lib/chat/types'
import type { ChatAction, ChatState, ChatMessage, HouseCardData } from '@/lib/chat/types'
import { formatPrice } from '@/lib/utils'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: ChatAction[]
  quickReplies?: string[]
  error?: boolean
}

let messageId = 0
const nextId = () => `m${++messageId}_${Date.now()}`

/* ------------------------------------------------------------------ text */

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|~[^~]+~|`[^`]+`|https?:\/\/[^\s<)]+)/g

function InlineText({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE)
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
      {parts.map((part, i) => {
        if (!part) return null
        if (part.startsWith('**') && part.length > 4) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(1, -1)}</strong>
        }
        if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>
        }
        if (part.startsWith('~') && part.endsWith('~') && part.length > 2) {
          return <del key={i} className="opacity-80">{part.slice(1, -1)}</del>
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return <code key={i} className="rounded bg-black/5 dark:bg-white/10 px-1 py-0.5 text-[12px]">{part.slice(1, -1)}</code>
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline dark:text-blue-400">
              {part}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </p>
  )
}

function FormattedText({ text }: { text: string }) {
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />
        return <InlineText key={i} text={line} />
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ cards */

function HouseCard({ card }: { card: HouseCardData }) {
  const [imgFailed, setImgFailed] = useState(false)
  const href = `/listings/${card.id}`
  const rent = card.rent ? formatPrice(card.rent) : null
  const fee = card.price ? formatPrice(card.price) : null
  const loc = card.descriptive_location || card.location || 'Unknown area'

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-700 dark:bg-slate-800"
    >
      <div className="flex">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-gradient-to-br from-blue-100 to-emerald-100 dark:from-slate-700 dark:to-slate-800">
          {card.image && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image}
              alt={card.title}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <HomeIcon className="h-7 w-7 text-gray-400 dark:text-gray-500" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-2.5">
          <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{card.title}</p>
          <p className="truncate text-[11.5px] text-gray-500 dark:text-gray-400">{loc}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium">
            {rent && <span className="text-emerald-700 dark:text-emerald-400">{rent}/mo</span>}
            {fee && <span className="text-gray-500 dark:text-gray-400">· {fee} fee</span>}
          </div>
          {(card.badges ?? []).slice(0, 2).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(card.badges ?? []).slice(0, 2).map((b) => (
                <span key={b} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="grid w-8 shrink-0 place-items-center text-gray-300 transition group-hover:text-[#30B54A] dark:text-gray-600">
          <ArrowLeft className="h-4 w-4 -scale-x-100" />
        </div>
      </div>
    </Link>
  )
}

function ActionList({ actions }: { actions: ChatAction[] }) {
  return (
    <div className="mt-2.5 space-y-2">
      {actions.map((a, i) => {
        if (a.type === 'card' && a.card) {
          return <HouseCard key={`${a.card.id}_${i}`} card={a.card} />
        }
        const external = /^https?:\/\//.test(a.href ?? '') && !(a.href ?? '').startsWith('https://www.asehanta.com')
        return (
          <a
            key={i}
            href={a.href ?? '#'}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#30B54A]/50 bg-[#e8f8eb] px-3 py-2 text-[12.5px] font-semibold text-[#2a9c40] transition hover:bg-[#d7f2dd] dark:bg-[#30B54A]/15 dark:text-[#6fdc84]"
          >
            {external && <ExternalLink className="h-3.5 w-3.5" />}
            {a.label ?? 'Open'}
          </a>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ bubbles */

function Bubble({ msg }: { msg: UiMessage }) {
  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#30B54A] px-3.5 py-2 text-white shadow-sm">
          <FormattedText text={msg.content} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#30B54A] to-emerald-600 text-[11px] font-bold text-white shadow-sm">
        A
      </div>
      <div
        className={`max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2 shadow-sm ${
          msg.error
            ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300'
            : 'bg-white text-gray-800 ring-1 ring-gray-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
        }`}
      >
        <FormattedText text={msg.content} />
        {msg.actions && <ActionList actions={msg.actions} />}
        {msg.quickReplies && msg.quickReplies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.quickReplies.map((q) => (
              <QuickChip key={q} text={q} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuickChip({ text }: { text: string }) {
  // Clicking is handled by the parent via context-free DOM event delegation:
  const onClick = () => {
    window.dispatchEvent(new CustomEvent('ase-quick', { detail: text }))
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[#30B54A]/40 bg-[#e8f8eb] px-2.5 py-1 text-[12px] font-medium text-[#2a9c40] transition hover:bg-[#d7f2dd] active:scale-95 dark:bg-[#30B54A]/15 dark:text-[#6fdc84]"
    >
      {text}
    </button>
  )
}

function TypingDots() {
  return (
    <div className="flex items-end gap-2">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#30B54A] to-emerald-600 text-[11px] font-bold text-white shadow-sm">
        A
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-slate-800 dark:ring-gray-700">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:240ms]" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ panel */

interface ChatPanelProps {
  variant: 'widget' | 'page'
  onClose?: () => void
}

export default function ChatPanel({ variant, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [chatState, setChatState] = useState<ChatState>(emptyState())
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [bubbling, setBubbling] = useState(false)
  const [uploadError, setUploadError] = useState('')
  // Number of opening bubbles already shown.
  const [introStep, setIntroStep] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isChangeDp = chatState.mode === 'change_dp'

  const openingMsgs = useMemo(() => buildOpeningMessages(), [])

  const append = useCallback((msg: UiMessage) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || loading) return
      // User is talking — stop the intro sequence so no more opening bubbles pop in.
      setIntroStep(openingMsgs.length)
      setInput('')
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }])
      setLoading(true)

      try {
        const history: ChatMessage[] = messages
          .filter((m) => !m.error)
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }))

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, state: chatState, history }),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Request failed')

        setChatState(data.state ?? emptyState())

        // Turn the reply into WhatsApp-style bubbles. The shared parser handles
        // `---` markers in every messy form the model produces, strips
        // [[button text|url]] markers into actions, and never emits a blank
        // bubble (a button-only segment is folded into the previous bubble).
        const bubbles = splitBubbles(data.reply || '…')

        // Show each bubble one at a time with a random human delay, like a real
        // person texting. Buttons render on the bubble they belong to.
        const delay = () => 1000 + Math.random() * 800
        let i = 0
        setBubbling(true)
        const showNext = () => {
          if (i >= bubbles.length) {
            setBubbling(false)
            return
          }
          const bubble = bubbles[i]
          append({
            id: nextId(),
            role: 'assistant',
            content: bubble.text,
            actions: bubble.buttons.length > 0 ? bubble.buttons : undefined,
            quickReplies: undefined,
          })
          i += 1
          if (i < bubbles.length) {
            setTimeout(showNext, delay())
          } else {
            setBubbling(false)
          }
        }
        if (bubbles.length === 0) {
          setBubbling(false)
          append({ id: nextId(), role: 'assistant', content: '…' })
        } else {
          showNext()
        }
      } catch {
        append({
          id: nextId(),
          role: 'assistant',
          content: `Sorry — I hit a hiccup reaching the server. Please try again in a moment. 🙏`,
          error: true,
        })
      } finally {
        setLoading(false)
      }
    },
    [append, chatState, loading, messages, openingMsgs.length]
  )

  const uploadAvatar = async (file: File) => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    const MAX_SIZE = 4 * 1024 * 1024

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Use a JPG, PNG, WebP or AVIF image.')
      return
    }
    if (file.size > MAX_SIZE) {
      setUploadError('Profile pictures must be 4MB or smaller.')
      return
    }

    setUploading(true)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed')

      setUploading(false)
      setInput('')
      setUploadError('')

      // Exit the change_dp flow locally.
      setChatState(emptyState())

      append({
        id: nextId(),
        role: 'assistant',
        content: `✅ *Profile picture updated!* Your new photo is live.\n\nOpen your profile to see it: https://www.asehanta.com/profile`,
        actions: [{ type: 'link', label: '👤 View profile', href: 'https://www.asehanta.com/profile' }],
        quickReplies: ['🏠 Find me a house', '📊 House stats', '📞 Contact'],
      })
    } catch {
      setUploading(false)
      setUploadError('Upload failed. Please try again.')
    }
  }

  // Opening messages — sent one bubble at a time, the way a person texts on WhatsApp.
  // The first bubble is a time-based greeting.
  useEffect(() => {
    if (introStep >= openingMsgs.length) return
    const delay = introStep < 4 ? 1500 + Math.random() * 1000 : 900
    const id = setTimeout(() => {
      append({
        id: nextId(),
        role: 'assistant',
        content: openingMsgs[introStep],
        quickReplies: undefined,
      })
      setIntroStep((s) => s + 1)
    }, delay)
    return () => clearTimeout(id)
  }, [introStep, append, openingMsgs])

  const introTyping = introStep < openingMsgs.length

  // Quick-chip clicks.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (detail) send(detail)
    }
    window.addEventListener('ase-quick', handler)
    return () => window.removeEventListener('ase-quick', handler)
  }, [send])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading, introTyping])

  const isPage = variant === 'page'

  return (
    <div className={`flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-900 ${isPage ? 'h-[calc(100dvh-120px)] rounded-2xl ring-1 ring-gray-200 dark:ring-gray-700' : 'h-full'}`}>
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-3.5 py-2.5 dark:border-gray-700 dark:bg-slate-800">
        {isPage && (
          <Link href="/" className="grid h-7 w-7 place-items-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#30B54A] to-emerald-600 text-[15px] font-bold text-white shadow-sm">
          A
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Ase</p>
          <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> AseHanta&apos;s digital assistant · online
          </p>
        </div>
        {isPage && (
          <Link href="/" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#2a9c40] hover:bg-[#e8f8eb] dark:text-[#6fdc84] dark:hover:bg-[#30B54A]/10">
            <ExternalLink className="h-3.5 w-3.5" /> Home
          </Link>
        )}
        {!isPage && onClose && (
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700" aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {(introTyping || loading || bubbling) && <TypingDots />}
        {!introTyping && !loading && !messages.some((m) => m.role === 'user') && (
          <p className="mx-auto max-w-xs text-center text-[11px] leading-relaxed text-gray-400">
            I remember our conversation only in this window — refresh to start fresh.
          </p>
        )}
      </div>

      {/* input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-center gap-2 border-t border-gray-100 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-slate-800"
      >
        {isChangeDp ? (
          <>
            <div className="flex items-center gap-2">
              <label
                htmlFor="dp-upload"
                className="relative flex flex-col items-center gap-1 shrink-0"
              >
                <input
                  id="dp-upload"
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadAvatar(file)
                    e.target.value = ''
                  }}
                  className="hidden"
                  disabled={uploading || loading}
                />
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-all ${
                    uploading
                      ? 'bg-[#30B54A]/20 text-[#30B54A] border border-[#30B54A]/40'
                      : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-[#30B54A]/10 hover:text-[#30B54A]'
                  } dark:${
                    uploading
                      ? 'bg-[#30B54A]/20 text-[#30B54A] border border-[#30B54A]/40'
                      : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-[#30B54A]/10 hover:text-[#30B54A]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-tighter text-gray-500 dark:text-slate-400">
                  {uploading ? 'Uploading…' : 'Photo'}
                </span>
              </label>
              {uploadError && (
                <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">{uploadError}</span>
              )}
              {!uploading && !uploadError && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium max-w-xs">
                  JPG, PNG, WebP, AVIF · Max 4MB
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setInput('')
                setUploadError('')
                setChatState(emptyState())
              }}
              className="flex h-10 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-gray-50 px-3 text-gray-600 text-[12px] font-semibold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600/50"
              disabled={uploading || loading}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Ase…"
              aria-label="Message Ase"
              maxLength={600}
              className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-[13.5px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#30B54A] focus:ring-2 focus:ring-[#30B54A]/20 dark:border-gray-600 dark:bg-slate-700 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || bubbling}
              aria-label="Send message"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#30B54A] text-white shadow-sm transition hover:bg-[#2a9c40] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        )}
      </form>

      {isPage && (
        <div className="flex items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-400 dark:border-gray-700 dark:bg-slate-900">
          <Sparkles className="h-3 w-3" /> Ase helps with houses, WiFi, movers, terms &amp; more
        </div>
      )}
    </div>
  )
}
