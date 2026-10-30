'use client'

import { useSyncExternalStore } from 'react'
import { Cookie, X } from 'lucide-react'

const CONSENT_KEY = 'cookie_consent'
const CHANGE_EVENT = 'cookie-consent-change'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function getSnapshot() {
  return !localStorage.getItem(CONSENT_KEY)
}

function getServerSnapshot() {
  return false
}

export default function CookieBanner() {
  // useSyncExternalStore keeps the server and first client render identical,
  // then reads localStorage safely without a hydration mismatch.
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const dismiss = (choice: 'accepted' | 'declined') => {
    localStorage.setItem(CONSENT_KEY, choice)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-gray-900/95 text-white px-4 py-4 shadow-lg animate-slideUp">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-start gap-2 flex-1">
          <Cookie className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <p className="text-sm leading-relaxed">
            We use cookies to keep you signed in and improve your experience.
            If you decline, you&apos;ll need to log in each time you visit.
            <a href="/terms" target="_blank" className="text-blue-400 hover:underline ml-1">Learn more</a>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => dismiss('declined')} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:border-gray-500 transition-colors">
            Decline
          </button>
          <button onClick={() => dismiss('accepted')} className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Accept
          </button>
          <button onClick={() => dismiss('declined')} aria-label="Close cookie banner" className="text-gray-500 hover:text-white ml-1"><X className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}
