'use client'

import { useState, type CSSProperties } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

/**
 * Holiday scene for the home + auth pages, in both light and dark mode.
 *
 * A random subset of the scene is picked once per page load so every refresh
 * shows a slightly different mix: drifting snow, a string of festive lights,
 * a warm haze/aurora, twinkling stars and an evergreen wreath in the corner.
 * It only renders after the theme has resolved, it is purely decorative
 * (`aria-hidden`, no pointer events), and every animation lives behind a
 * reduced-motion override. Colours adapt to the active theme in CSS.
 */

type SceneFlag = 'snow' | 'lights' | 'aurora' | 'stars' | 'wreath'

const ALL_FLAGS: SceneFlag[] = ['snow', 'lights', 'aurora', 'stars', 'wreath']

type Flake = { left: number; size: number; delay: number; duration: number; drift: number; opacity: number }
type Spark = { left: number; top: number; size: number; delay: number; duration: number }
type Bulb = { left: number; top: number; delay: number; color: string; glow: string }

const BULB_COLORS = [
  { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.75)' },
  { color: '#f87171', glow: 'rgba(248, 113, 113, 0.75)' },
  { color: '#60A5FA', glow: 'rgba(96, 165, 250, 0.75)' },
  { color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.75)' },
  { color: '#fef3c7', glow: 'rgba(254, 243, 199, 0.8)' },
]

function makeFlakes(count: number): Flake[] {
  return Array.from({ length: count }, () => ({
    left: Math.round(Math.random() * 100),
    size: Math.round(3 + Math.random() * 5),
    delay: -Math.round(Math.random() * 1800) / 100,
    duration: Math.round(900 + Math.random() * 1100) / 100,
    drift: Math.round((Math.random() - 0.5) * 60),
    opacity: Math.round((0.45 + Math.random() * 0.45) * 100) / 100,
  }))
}

function makeSparks(count: number): Spark[] {
  return Array.from({ length: count }, () => ({
    left: Math.round(2 + Math.random() * 94),
    top: Math.round(8 + Math.random() * 78),
    size: Math.round(2 + Math.random() * 4),
    delay: Math.round(Math.random() * 6000) / 100,
    duration: Math.round(2800 + Math.random() * 3400) / 100,
  }))
}

/** Bulbs follow the same quadratic curve as the wire (viewBox 100 × 22). */
function makeBulbs(count: number): Bulb[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count
    const y = 2 + 36 * t * (1 - t)
    const shade = BULB_COLORS[i % BULB_COLORS.length]
    return {
      left: Math.round(t * 1000) / 10,
      top: Math.round((y / 22) * 1000) / 10,
      delay: Math.round(Math.random() * 2600) / 100,
      color: shade.color,
      glow: shade.glow,
    }
  })
}

export default function SeasonalScene({ className = '' }: { className?: string }) {
  const { mounted } = useTheme()

  // Picked once per mount so a refresh gives a new, consistent mix.
  const [flags] = useState<SceneFlag[]>(() => {
    let out = ALL_FLAGS.filter(() => Math.random() < 0.72)
    if (!out.includes('snow') && Math.random() < 0.8) out.push('snow')
    if (out.length < 2) out = ['snow', 'lights', 'stars']
    return out
  })
  const [flakes] = useState<Flake[]>(() => makeFlakes(16))
  const [sparks] = useState<Spark[]>(() => makeSparks(11))
  const [bulbs] = useState<Bulb[]>(() => makeBulbs(14))

  if (!mounted) return null

  const show = (flag: SceneFlag) => flags.includes(flag)

  return (
    <div aria-hidden="true" className={`seasonal-scene pointer-events-none select-none ${className}`}>
      {show('aurora') && <span className="seasonal-aurora" />}

      {show('lights') && (
        <div className="seasonal-lights">
          <svg className="lights-wire" viewBox="0 0 100 22" preserveAspectRatio="none" focusable="false">
            <path d="M0 2 Q 50 20 100 2" fill="none" stroke="currentColor" strokeWidth="0.45" vectorEffect="non-scaling-stroke" />
          </svg>
          {bulbs.map((b, i) => (
            <span
              key={i}
              className="light-bulb"
              style={
                {
                  left: `${b.left}%`,
                  top: `${b.top}%`,
                  animationDelay: `${b.delay}s`,
                  '--bulb': b.color,
                  '--bulb-glow': b.glow,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {show('snow') &&
        flakes.map((f, i) => (
          <span
            key={i}
            className="seasonal-snow"
            style={
              {
                left: `${f.left}%`,
                width: f.size,
                height: f.size,
                animationDelay: `${f.delay}s`,
                animationDuration: `${f.duration}s`,
                '--drift': `${f.drift}px`,
                '--flake-opacity': f.opacity,
              } as CSSProperties
            }
          />
        ))}

      {show('stars') &&
        sparks.map((s, i) => (
          <span
            key={i}
            className="seasonal-star-dot"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}

      {show('wreath') && (
        <div className="seasonal-wreath">
          <span className="wreath-berries" />
          <span className="wreath-bow" />
        </div>
      )}
    </div>
  )
}
