'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Download, Share, Smartphone, X } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NavigatorWithInstall = Navigator & {
  standalone?: boolean
  getInstalledRelatedApps?: () => Promise<Array<{ id?: string }>>
}

const DISMISS_KEY = 'asehanta:install-prompt-dismissed'
const PROMPT_DELAY = 3500
const COOKIE_DELAY = 7000

function remember(value: 'installed' | 'dismissed') {
  try {
    localStorage.setItem(DISMISS_KEY, value)
  } catch {
    // Storage can be unavailable in private mode; the popup still closes.
  }
}

function alreadyDismissed() {
  try {
    return Boolean(localStorage.getItem(DISMISS_KEY))
  } catch {
    return false
  }
}

function hasCookieChoice() {
  try {
    return Boolean(localStorage.getItem('cookie_consent'))
  } catch {
    return true
  }
}

function isRunningStandalone(nav: NavigatorWithInstall) {
  return (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    nav.standalone === true
  )
}

function isIosSafari(nav: NavigatorWithInstall) {
  const agent = nav.userAgent
  const ios = /iPad|iPhone|iPod/.test(agent) && !(window as Window & { MSStream?: unknown }).MSStream
  const webkit = /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS|MicroMessenger/.test(agent)
  return ios && webkit
}

export default function InstallPrompt() {
  const [ready, setReady] = useState(false)
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<'native' | 'ios' | null>(null)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const nav = window.navigator as NavigatorWithInstall
    let alive = true
    const standalone = isRunningStandalone(nav)
    const dismissed = alreadyDismissed()
    const ios = isIosSafari(nav)

    // Registering the service worker makes the app installable on Chromium and
    // gives returning users an offline fallback. It never blocks the prompt.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    }

    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }

    const schedule = () => {
      if (!alive || timer.current !== null || standalone) return
      const delay = hasCookieChoice() ? PROMPT_DELAY : COOKIE_DELAY
      timer.current = window.setTimeout(() => {
        timer.current = null
        if (alive) setShow(true)
      }, delay)
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      if (!alive || standalone || alreadyDismissed()) return
      setInstallEvent(promptEvent)
      setMode('native')
      schedule()
    }

    const onAppInstalled = () => {
      remember('installed')
      clearTimer()
      setShow(false)
      setInstallEvent(null)
    }

    if (!standalone && !dismissed) {
      window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.addEventListener('appinstalled', onAppInstalled)

      if (typeof nav.getInstalledRelatedApps === 'function') {
        nav
          .getInstalledRelatedApps()
          .then((apps) => {
            if (alive && apps.length > 0) onAppInstalled()
          })
          .catch(() => {})
      }
    }

    queueMicrotask(() => {
      if (!alive) return
      if (standalone || dismissed) {
        setReady(true)
        return
      }
      if (ios) {
        setMode('ios')
        schedule()
      }
      setReady(true)
    })

    return () => {
      alive = false
      clearTimer()
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const dismiss = () => {
    remember('dismissed')
    setShow(false)
    setInstallEvent(null)
  }

  const install = async () => {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      remember(choice.outcome === 'accepted' ? 'installed' : 'dismissed')
    } catch {
      remember('dismissed')
    }
    setInstallEvent(null)
    setShow(false)
  }

  if (!ready || !show || !mode) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-labelledby="install-prompt-title"
      className="fixed bottom-28 left-1/2 z-[65] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-fadeInUp"
    >
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-700 via-sky-500 to-amber-400" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="absolute right-3 top-3 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-7">
          <div className="relative shrink-0">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={52}
              height={52}
              className="h-[52px] w-[52px] rounded-2xl shadow-md"
            />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white ring-2 ring-white dark:ring-slate-900">
              <Download className="h-3.5 w-3.5" />
            </span>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-sky-400">
              Install the app
            </p>
            <h2 id="install-prompt-title" className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
              Take AseHanta with you
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Find houses, track escrow and chat with Ase faster from your home screen.
            </p>
          </div>
        </div>

        {mode === 'ios' && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4 text-blue-700 dark:text-sky-400" />
              Add to Home Screen on iPhone
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              <li>Tap the Share button below.</li>
              <li>Choose Add to Home Screen.</li>
              <li>Tap Add to confirm.</li>
            </ol>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {mode === 'native' ? (
            <button
              type="button"
              onClick={install}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800 active:scale-95"
            >
              <Download className="h-4 w-4" />
              Install AseHanta
            </button>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-800 active:scale-95"
            >
              <Share className="h-4 w-4" />
              Got it
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
