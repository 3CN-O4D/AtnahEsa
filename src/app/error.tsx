'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, MessageCircle, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { WHATSAPP_NUMBER } from '@/lib/constants'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const support = getWhatsAppLink(
    WHATSAPP_NUMBER,
    'Hi AseHanta, I ran into an error on the website. Can you help?'
  )

  return (
    <div className="relative min-h-[70vh] flex items-center justify-center px-4 py-16 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-red-400/10 blur-3xl" />
      <div className="relative text-center max-w-md animate-scaleIn">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500 mb-2">Something broke</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">We hit an unexpected error</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your data is safe. Try again, or reach our team if it keeps happening.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={reset}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Try again
          </Button>
          <Link href="/" className="inline-flex">
            <Button variant="outline" className="w-full">
              <Home className="w-4 h-4 mr-1.5" /> Go home
            </Button>
          </Link>
          {support && (
            <a href={support} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button variant="outline" className="w-full">
                <MessageCircle className="w-4 h-4 mr-1.5" /> Get help
              </Button>
            </a>
          )}
        </div>
        {error.digest && (
          <p className="mt-5 text-[11px] text-gray-400 dark:text-gray-500">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
      </div>
    </div>
  )
}
