import Link from 'next/link'
import { Compass, Home, MessageCircle } from 'lucide-react'
import { getWhatsAppLink } from '@/lib/whatsapp'
import { WHATSAPP_NUMBER } from '@/lib/constants'

export default function NotFound() {
  const support = getWhatsAppLink(
    WHATSAPP_NUMBER,
    'Hi AseHanta, I could not find a page on the website. Can you help?'
  )

  return (
    <div className="relative min-h-[70vh] flex items-center justify-center px-4 py-16 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="relative text-center max-w-md animate-scaleIn">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
          <Compass className="w-8 h-8" />
        </div>
        <p className="text-6xl font-bold text-gray-200 dark:text-gray-800 leading-none mb-2">404</p>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">This page moved or never existed</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Check the link, or head back home to keep browsing houses.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link href="/" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            <Home className="w-4 h-4" /> Back to home
          </Link>
          <Link href="/request-house" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Request a house
          </Link>
        </div>
        {support && (
          <a href={support} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
            <MessageCircle className="w-3.5 h-3.5" /> Still stuck? Chat with us
          </a>
        )}
      </div>
    </div>
  )
}
