'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import ChatPanel from './ChatPanel'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)

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
          <div className="relative grid h-full w-full place-items-center">
            <MessageCircle className="h-6 w-6" />
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-400 dark:border-slate-900" />
          </div>
        )}
      </button>
    </>
  )
}
