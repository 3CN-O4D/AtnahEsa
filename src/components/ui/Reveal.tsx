'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  className?: string
  /** Delay before the reveal animation starts, in milliseconds. */
  delay?: number
  /** Replay the animation every time the element re-enters the viewport. */
  repeat?: boolean
}

/**
 * Fades and lifts its children into view the first time they are scrolled to.
 * Uses direct class toggling so revealing never triggers a React re-render.
 */
export default function Reveal({ children, className, delay = 0, repeat = false }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion) {
      el.classList.add('is-visible')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-visible')
            if (!repeat) observer.unobserve(entry.target)
          } else if (repeat) {
            el.classList.remove('is-visible')
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [repeat])

  return (
    <div
      ref={ref}
      className={cn('reveal', className)}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  )
}
