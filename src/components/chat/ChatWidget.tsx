'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import ChatPanel from './ChatPanel'

/**
 * Floating Ase launcher — a labelled bot button that sits above the page on
 * every route, bobs gently and invites visitors to chat. Opens the panel on
 * click, or when an inline <AseCta /> fires "ase:open".
 * Hidden only on the full-page chat and admin areas.
 */
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState(false)
  const pathname = usePathname()

  // Inline "Check out with Ase" buttons anywhere on the page open this widget.
  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setHint(false)
    }
    window.addEventListener('ase:open', onOpen)
    return () => window.removeEventListener('ase:open', onOpen)
  }, [])

  // Invite people to chat a few seconds after load, then let the bubble drift away.
  useEffect(() => {
    if (open) return
    const show = window.setTimeout(() => setHint(true), 4500)
    const hide = window.setTimeout(() => setHint(false), 15000)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [open])

  const toggle = useCallback(() => {
    setOpen((o) => !o)
    setHint(false)
  }, [])

  const openChat = useCallback(() => {
    setOpen(true)
    setHint(false)
  }, [])

  if (pathname?.startsWith('/chat') || pathname?.startsWith('/admin')) return null

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[70] h-[min(600px,82vh)] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-slate-900">
          <ChatPanel variant="widget" onClose={() => setOpen(false)} />
        </div>
      )}

      {!open && hint && (
        <button type="button" onClick={openChat} className="ase-hint" aria-label="Chat with Ase">
          <span className="ase-hint-dot" aria-hidden="true" />
          <span>Hi, I&apos;m Ase 👋 Need help finding a home?</span>
        </button>
      )}

      <button
        type="button"
        onClick={toggle}
        onMouseEnter={() => {
          if (!open) setHint(true)
        }}
        onMouseLeave={() => setHint(false)}
        aria-label={open ? 'Close Ase chat' : 'Chat with Ase'}
        className={`ase-fab${open ? ' ase-fab--open' : ''}`}
      >
        <span className="ase-fab-inner">
          <span className="ase-fab-avatar">
            <span className="ase-ring" aria-hidden="true" />
            <span className="ase-mascot ase-bot" aria-hidden="true">
              <span className="ase-antenna" />
              <span className="ase-visor">
                <span className="ase-eye ase-eye-l" />
                <span className="ase-eye ase-eye-r" />
              </span>
              <span className="ase-smile" />
              <span className="ase-spark" />
            </span>
            <span className="ase-fab-online" aria-hidden="true" />
          </span>
          <span className="ase-fab-copy">
            <span className="ase-fab-name">{open ? 'Ase is here' : 'Ase'}</span>
            <span className="ase-fab-sub">{open ? 'Tap to close' : 'Chat with me'}</span>
          </span>
          <span className="ase-fab-arrow" aria-hidden="true">
            {open ? '×' : '💬'}
          </span>
        </span>
      </button>
    </>
  )
}
