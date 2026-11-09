'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import ChatPanel from './ChatPanel'

/**
 * Floating chat button.
 * Only appears when the backend AI is configured (`enabled`) and the current
 * page actually benefits from it — never on the full-page chat or admin areas.
 */
export default function ChatWidget({ enabled = false }: { enabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  if (!enabled) return null
  if (pathname?.startsWith('/chat') || pathname?.startsWith('/admin')) return null

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-[70] h-[min(600px,82vh)] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-slate-900">
          <ChatPanel variant="widget" onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Ase chat' : 'Chat with Ase'}
        className="fixed bottom-6 right-6 z-[70] flex h-14 w-14 items-center justify-center rounded-full bg-[#30B54A] text-white shadow-lg transition-all hover:scale-110 hover:bg-[#2a9c40] active:scale-95"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  )
}