'use client'

import Link from 'next/link'
import {
  Home,
  MapPin,
  Key,
  ArrowLeft,
} from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import { APP_NAME, WHATSAPP_NUMBER } from '@/lib/constants'

/**
 * Heavily animated, house-hunting-themed 404 page.
 * Pure CSS animations (respects prefers-reduced-motion) plus a staggered
 * entrance via Reveal. All decorative motion is CSS — no images, so it is
 * bandwidth-friendly on the Cloudflare free tier.
 */
export default function NotFoundPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-slate-950">
      {/* Blueprint grid background */}
      <div className="absolute inset-0 notfound-grid text-[#30B54A]/5 dark:text-[#6fdc84]/10 pointer-events-none" />

      {/* Floating decorative orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="notfound-orb -left-20 -top-24 h-72 w-72 bg-[#30B54A]/20" />
        <div className="notfound-orb top-0 -right-24 h-80 w-80 bg-blue-500/15" style={{ animationDelay: '2s' }} />
        <div className="notfound-orb -bottom-20 left-1/4 h-56 w-56 bg-red-500/15" style={{ animationDelay: '4s' }} />
        <div className="notfound-orb bottom-1/3 right-1/5 h-48 w-48 bg-purple-500/10" style={{ animationDelay: '6s' }} />
      </div>

      <main className="relative flex-1 mx-auto max-w-5xl px-4 py-12">
        {/* Top nav */}
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900/90 dark:text-gray-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500">
              <span className="w-1 h-1 rounded-full bg-[#30B54A] animate-pulse-slow" />
              {APP_NAME} · House hunting
            </span>
          </div>
        </Reveal>

        {/* Hero: giant 404 with a house inside */}
        <Reveal delay={60}>
          <div className="relative text-center mb-10">
            <div
              className="inline-flex items-center justify-center h-36 w-36 rounded-3xl bg-gradient-to-br from-white to-gray-100 dark:from-slate-900 dark:to-slate-950 border border-gray-200/60 dark:border-slate-800/60 shadow-2xl mb-4 relative overflow-hidden animate-tada"
            >
              <Home className="h-16 w-16 text-red-500 drop-shadow-lg" />
              {/* Tiny "For Sale" rider on the house */}
              <div className="absolute -top-1 -right-1 bg-red-600 text-[8px] font-bold text-white px-1.5 py-0.5 rounded-tl-sm rounded-br-sm shadow-md">
                FOR SALE
              </div>
            </div>

            <h1 className="text-[8rem] font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-red-700 to-red-900 dark:from-red-400 dark:via-red-600 dark:to-red-800 tracking-tighter -mb-1 select-none">
              404
            </h1>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
              This house has been taken off the market.
            </p>
            <p className="mt-3 text-gray-500 dark:text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
              The page you&apos;re looking for isn&apos;t available — but there are plenty of other homes
              waiting to be viewed. Pick one below and book a viewing.
            </p>
          </div>
        </Reveal>

        {/* Animated yard sign + shaking key + sold stamp */}
        <Reveal delay={140}>
          <div className="grid md:grid-cols-3 gap-8 items-center justify-items-center">
            {/* Yard sign */}
            <div className="relative flex flex-col items-center">
              <div className="notfound-sign relative h-16 w-40 flex items-center justify-center bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-amber-500/40 rounded-sm rotate-180 transform origin-bottom sm:rotate-0">
                FOR SALE
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-0 h-0 border-l-3 border-r-3 border-transparent border-t-amber-400" />
              </div>
              <div className="mt-1.5 w-1 h-8 bg-gray-400 dark:bg-gray-600 rounded-full shadow-sm" />
              <div className="mt-1 w-4 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">Not this one.</p>
            </div>

            {/* Key */}
            <div className="relative flex flex-col items-center justify-center">
              <div className="relative notfound-key h-24 w-24 text-amber-500 drop-shadow-lg group cursor-help">
                <Key className="h-full w-full" />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  Wrong key
                </span>
              </div>
              <div className="absolute inset-0 rounded-full border border-dashed border-amber-200 dark:border-amber-900/30 animate-pulse" />
              <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 text-center">Try another door.</p>
            </div>

            {/* Sold stamp */}
            <div className="relative flex flex-col items-center justify-center">
              <div className="relative notfound-stamp h-24 w-24 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-red-500/40 rounded-full animate-pulse" />
                <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 border border-red-500/30">
                  <MapPin className="h-10 w-10 text-red-600" />
                </div>
                <div className="absolute -inset-1 flex items-center justify-center rounded-full border-2 border-red-500/60 opacity-50 rotate-12 animate-spin-slow" />
              </div>
              <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                Sold / Unavailable
              </p>
            </div>
          </div>
        </Reveal>

        {/* Call to action */}
        <Reveal delay={220}>
          <div className="flex flex-wrap justify-center gap-3 mt-12">
            <Link
              href="/"
              className="rounded-xl bg-[#30B54A] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#30B54A]/30 transition-all hover:-translate-y-1 hover:bg-[#2a9c40] hover:shadow-xl active:scale-95 dark:hover:shadow-green-500/20"
            >
              <Home className="h-4 w-4 mr-1.5" /> Browse homes
            </Link>
            <Link
              href="/request-house"
              className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
            >
              <MapPin className="h-4 w-4 mr-1.5" /> Request a house
            </Link>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-green-500/50 px-6 py-3 text-sm font-semibold text-green-700 bg-green-50 dark:border-green-500/30 dark:bg-green-950/30 dark:text-green-400 transition-colors hover:bg-green-100 hover:-translate-y-1 dark:hover:bg-green-950/60"
            >
              <svg className="h-4 w-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              Chat on WhatsApp
            </a>
          </div>
        </Reveal>

        {/* Playful closing note */}
        <Reveal delay={300}>
          <div className="mt-16 flex items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span className="w-1 h-1 rounded-full bg-[#30B54A] animate-pulse-slow" />
            No photos were harmed in the making of this 404 page.{' '}
            <Link href="/" className="text-[#30B54A] hover:underline font-medium">Find a home instead &rarr;</Link>
          </div>
        </Reveal>
      </main>
    </div>
  )
}
