'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * A slim top-of-page progress bar that starts as soon as an internal link is
 * clicked and completes when the new route renders. It gives slow connections
 * immediate feedback without blocking navigation.
 *
 * Uses refs and direct style updates so navigation never causes a React
 * re-render just to animate the bar.
 */
function RouteProgressInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const barRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)
  const routeKey = `${pathname}?${searchParams.toString()}`

  useEffect(() => {
    const el = barRef.current
    if (!el) return

    let interval: number | undefined
    let hideTimer: number | undefined
    let safetyTimer: number | undefined
    let width = 0

    const apply = (nextWidth: number, opacity: number) => {
      width = nextWidth
      el.style.width = `${nextWidth}%`
      el.style.opacity = String(opacity)
    }

    const stopTicking = () => {
      if (interval !== undefined) {
        window.clearInterval(interval)
        interval = undefined
      }
    }

    const start = () => {
      if (activeRef.current) return
      activeRef.current = true
      stopTicking()
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer)
        hideTimer = undefined
      }
      apply(7, 1)
      interval = window.setInterval(() => {
        // Ease towards 90% and wait there for the route to finish.
        const step = Math.max(1.4, (90 - width) * 0.16)
        apply(Math.min(90, width + step), 1)
      }, 200)
      // Never leave the bar stuck if a click did not actually navigate.
      safetyTimer = window.setTimeout(finish, 9000)
    }

    const finish = () => {
      if (!activeRef.current) return
      activeRef.current = false
      stopTicking()
      if (safetyTimer !== undefined) {
        window.clearTimeout(safetyTimer)
        safetyTimer = undefined
      }
      apply(100, 1)
      hideTimer = window.setTimeout(() => {
        apply(0, 0)
      }, 380)
    }

    // A route change means the navigation we started has rendered.
    finish()

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download') || anchor.getAttribute('aria-disabled') === 'true') return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (/^(mailto|tel|sms|javascript):/i.test(href)) return

      let url: URL
      try {
        url = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      start()
    }

    const onPopState = () => start()

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
      stopTicking()
      if (hideTimer !== undefined) window.clearTimeout(hideTimer)
      if (safetyTimer !== undefined) window.clearTimeout(safetyTimer)
      if (activeRef.current) {
        // The route changed but this instance is being replaced: snap to done.
        activeRef.current = false
        el.style.width = '100%'
        el.style.opacity = '1'
        window.setTimeout(() => {
          el.style.width = '0%'
          el.style.opacity = '0'
        }, 380)
      }
    }
    // Re-attach on every route so finish() runs exactly when navigation lands.
  }, [routeKey])

  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-[3px] pointer-events-none" aria-hidden="true">
      <div
        ref={barRef}
        className="nav-progress h-full w-0 opacity-0 transition-[width,opacity] duration-200 ease-out"
      />
    </div>
  )
}

export default function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  )
}
