'use client'

import { useState, useEffect } from 'react'
import { Cookie, X } from 'lucide-react'

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('cookie_consent')
    }
    return false
  })

  const accept = () => {
    localStorage.setItem('cookie_consent', 'accepted')
    setVisible(false)
  }

  const decline = () => {
    localStorage.setItem('cookie_consent', 'declined')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-gray-900/95 text-white px-4 py-4 shadow-lg">
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
          <button onClick={decline} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg hover:border-gray-500 transition-colors">
            Decline
          </button>
          <button onClick={accept} className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Accept
          </button>
          <button onClick={decline} className="text-gray-500 hover:text-white ml-1"><X className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}
