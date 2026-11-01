'use client'

import { useState } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

/**
 * Dark-mode Halloween scene for the home + auth pages.
 *
 * A random subset of the scene is picked once per page load so every refresh
 * shows a slightly different mix: moon with drifting clouds, rising mist, bats
 * that flap across, twinkling fireflies and a corner spider web. It only
 * renders after the theme has resolved and only in dark mode, it is purely
 * decorative (`aria-hidden`, no pointer events), and every animation lives
 * behind a reduced-motion override.
 */

type SceneFlag = 'moon' | 'mist' | 'bats' | 'fireflies' | 'web'

const ALL_FLAGS: SceneFlag[] = ['moon', 'mist', 'bats', 'fireflies', 'web']

type Firefly = { left: number; top: number; delay: number; duration: number; size: number }

function makeFireflies(count: number): Firefly[] {
  return Array.from({ length: count }, () => ({
    left: Math.round(4 + Math.random() * 90),
    top: Math.round(6 + Math.random() * 78),
    delay: Math.round(Math.random() * 6000) / 100,
    duration: Math.round(2600 + Math.random() * 3200) / 100,
    size: Math.round(3 + Math.random() * 3),
  }))
}

function Bat({ className = '' }: { className?: string }) {
  return (
    <span className={`seasonal-bat ${className}`}>
      <span className="bat-wing wing-l" />
      <span className="bat-wing wing-r" />
      <span className="bat-body" />
    </span>
  )
}

export default function SeasonalScene({ className = '' }: { className?: string }) {
  const { dark, mounted } = useTheme()

  // Picked once per mount so a refresh gives a new, consistent mix.
  const [flags] = useState<SceneFlag[]>(() => {
    let out = ALL_FLAGS.filter(() => Math.random() < 0.72)
    if (out.length < 2) out = ['moon', 'fireflies', 'mist']
    return out
  })
  const [fireflies] = useState<Firefly[]>(() => makeFireflies(7))

  if (!mounted || !dark) return null

  const show = (flag: SceneFlag) => flags.includes(flag)

  return (
    <div aria-hidden="true" className={`seasonal-scene pointer-events-none select-none ${className}`}>
      {show('moon') && (
        <>
          <div className="seasonal-moon-wrap">
            <span className="seasonal-moon" />
          </div>
          <span className="seasonal-cloud cloud-a" />
          <span className="seasonal-cloud cloud-b" />
        </>
      )}

      {show('mist') && (
        <>
          <span className="seasonal-mist mist-a" />
          <span className="seasonal-mist mist-b" />
          <span className="seasonal-mist mist-c" />
        </>
      )}

      {show('bats') && (
        <>
          <Bat />
          <Bat className="bat-b" />
        </>
      )}

      {show('fireflies') &&
        fireflies.map((f, i) => (
          <span
            key={i}
            className="seasonal-firefly"
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              width: f.size,
              height: f.size,
              animationDelay: `${f.delay}s`,
              animationDuration: `${f.duration}s`,
            }}
          />
        ))}

      {show('web') && (
        <div className="seasonal-web">
          <span className="seasonal-web-spider" />
        </div>
      )}
    </div>
  )
}
