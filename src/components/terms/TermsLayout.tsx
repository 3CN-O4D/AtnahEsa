'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, CheckCircle2, Globe2, ListChecks } from 'lucide-react'
import Reveal from '@/components/ui/Reveal'
import { cn } from '@/lib/utils'

export type TermsSection = {
  id: string
  number: string
  title: string
  body: ReactNode
}

interface TermsLayoutProps {
  lang: 'en' | 'sw'
  eyebrow: string
  title: string
  subtitle: string
  updated: string
  summary: { title: string; points: string[] }
  sections: TermsSection[]
  agreeNote: ReactNode
}

/**
 * Animated legal-document layout used by both the English and Kiswahili
 * versions of the Terms & Conditions. Adds a reading-progress bar, floating
 * hero, quick-summary panel with an animated gradient ring, a sticky table of
 * contents that tracks your position, and scroll-revealed section cards.
 */
export default function TermsLayout({
  lang,
  eyebrow,
  title,
  subtitle,
  updated,
  summary,
  sections,
  agreeNote,
}: TermsLayoutProps) {
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const total = doc.scrollHeight - window.innerHeight
      setProgress(total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    for (const section of sections) {
      const el = sectionRefs.current[section.id]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  const jump = (id: string) => {
    const el = sectionRefs.current[id]
    if (!el) return
    setActive(id)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const otherLabel = lang === 'en' ? 'Kiswahili' : 'English'

  return (
    <div className="relative min-h-screen overflow-x-clip bg-gray-50 dark:bg-slate-950">
      {/* Reading progress */}
      <div className="fixed inset-x-0 top-0 z-[60] h-1 motion-reduce:hidden">
        <div className="terms-progress h-full rounded-r-full transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
      </div>

      {/* Floating hero orbs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb -left-24 -top-20 h-72 w-72 bg-[#30B54A]/20" />
        <div className="hero-orb -right-20 top-0 h-80 w-80 bg-blue-500/20" style={{ animationDelay: '1.6s' }} />
        <div className="hero-orb bottom-0 left-1/3 h-64 w-64 bg-purple-500/10" style={{ animationDelay: '2.6s' }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
        {/* Top bar */}
        <Reveal>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900/90 dark:text-gray-300 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" /> {lang === 'en' ? 'Back to home' : 'Rudi nyumbani'}
            </Link>
            <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
              <Globe2 className="ml-2 mr-1 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Link
                href="/terms"
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  lang === 'en'
                    ? 'bg-[#30B54A] text-white shadow'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
                )}
              >
                English
              </Link>
              <Link
                href="/terms/sw"
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  lang === 'sw'
                    ? 'bg-[#30B54A] text-white shadow'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
                )}
              >
                Kiswahili
              </Link>
              <span className="sr-only">{lang === 'en' ? 'Switch to' : 'Badili lugha kwenda'} {otherLabel}</span>
            </div>
          </div>
        </Reveal>

        {/* Hero */}
        <header className="mt-10 max-w-3xl">
          <Reveal delay={60}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#30B54A]/25 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#2a9c40] shadow-sm backdrop-blur dark:border-[#30B54A]/30 dark:bg-slate-900/70 dark:text-[#6fdc84]">
              <BookOpen className="h-3.5 w-3.5" />
              {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-gray-900 dark:text-white sm:text-5xl">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">{subtitle}</p>
          </Reveal>
          <Reveal delay={240}>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{updated}</p>
          </Reveal>
        </header>

        {/* Quick summary panel */}
        <Reveal delay={300}>
          <div className="terms-panel mt-10">
            <div className="rounded-[calc(1rem-1px)] bg-white p-5 dark:bg-slate-900 sm:p-6">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-[#30B54A]" />
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{summary.title}</h2>
              </div>
              <ul className="mt-3 space-y-2">
                {summary.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#30B54A]" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        {/* Mobile table of contents */}
        <div className="mt-8 flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active === s.id
                  ? 'border-[#30B54A] bg-[#30B54A]/10 text-[#2a9c40] dark:text-[#6fdc84]'
                  : 'border-gray-200 bg-white text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-400'
              )}
            >
              {s.number}. {s.title}
            </button>
          ))}
        </div>

        <div className="mt-8 lg:grid lg:grid-cols-[1fr_240px] lg:items-start lg:gap-10">
          {/* Sections */}
          <div className="space-y-6">
            {sections.map((s, i) => (
              <Reveal key={s.id} delay={Math.min(i * 40, 240)}>
                <section
                  id={s.id}
                  ref={(el) => {
                    sectionRefs.current[s.id] = el
                  }}
                  className="group scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#30B54A]/40 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#30B54A]/40 sm:p-8"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#30B54A] to-emerald-600 text-sm font-extrabold text-white shadow-md shadow-[#30B54A]/25 transition-transform duration-300 group-hover:scale-110">
                      {s.number}
                    </span>
                    <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white sm:text-xl">{s.title}</h2>
                  </div>
                  <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300 [&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5">
                    {s.body}
                  </div>
                </section>
              </Reveal>
            ))}
          </div>

          {/* Sticky desktop table of contents */}
          <aside className="sticky top-24 hidden lg:block">
            <nav className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90" aria-label={lang === 'en' ? 'On this page' : 'Katika ukurasa huu'}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {lang === 'en' ? 'On this page' : 'Katika ukurasa huu'}
              </p>
              <div className="space-y-0.5">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => jump(s.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition-colors',
                      active === s.id
                        ? 'bg-[#30B54A]/10 font-semibold text-[#2a9c40] dark:text-[#6fdc84]'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-100'
                    )}
                  >
                    <span className={cn('mt-0.5 text-[11px] font-bold', active === s.id ? 'text-[#30B54A]' : 'text-gray-400')}>{s.number}</span>
                    <span>{s.title}</span>
                  </button>
                ))}
              </div>
            </nav>
          </aside>
        </div>

        {/* Agree note */}
        <Reveal>
          <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#30B54A]/10 text-[#30B54A]">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div className="text-sm text-gray-600 dark:text-gray-300">{agreeNote}</div>
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
