import type { Metadata } from 'next'
import ChatPanel from '@/components/chat/ChatPanel'

export const metadata: Metadata = {
  title: 'Chat with Ase',
  description: 'Chat with Ase, the AseHanta virtual assistant — find houses, request houses, book WiFi, arrange movers and more.',
}

export default function ChatPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex items-center gap-3 animate-fadeIn">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#30B54A] to-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/20">
          A
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Chat with Ase</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask me about houses, WiFi, movers, escrow, terms or anything AseHanta.
          </p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-gray-200 dark:ring-gray-700 animate-slideUp">
        <ChatPanel variant="page" />
      </div>
    </div>
  )
}
