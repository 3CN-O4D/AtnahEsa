'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

/**
 * Seasonal hanging decoration for the home + auth pages.
 *
 * Dark mode drops a spider, or sometimes a pendant lamp / pumpkin lamp / candle.
 * Light mode drops a doll or a friendly monkey. Shapes are pure CSS so they look
 * the same on every platform, they are `aria-hidden`, they never capture clicks,
 * and the whole thing only appears once the theme has been resolved so it never
 * flashes the wrong family. All motion lives behind a reduced-motion override.
 */

type Variant = 'spider' | 'lamp' | 'pumpkin' | 'candle' | 'doll' | 'monkey'

const DARK_VARIANTS: Variant[] = ['spider', 'lamp', 'pumpkin', 'candle']
const LIGHT_VARIANTS: Variant[] = ['doll', 'monkey']

const legStyle = (top: number, rotate: number): CSSProperties =>
  ({ top, '--leg-rotate': `${rotate}deg` }) as CSSProperties

function Spider() {
  return (
    <div className="seasonal-spider">
      <span className="spider-leg leg-l" style={legStyle(31, -8)} />
      <span className="spider-leg leg-l" style={legStyle(38, 6)} />
      <span className="spider-leg leg-l" style={legStyle(45, 16)} />
      <span className="spider-leg leg-l" style={legStyle(52, 26)} />
      <span className="spider-leg leg-r" style={legStyle(31, 8)} />
      <span className="spider-leg leg-r" style={legStyle(38, -6)} />
      <span className="spider-leg leg-r" style={legStyle(45, -16)} />
      <span className="spider-leg leg-r" style={legStyle(52, -26)} />
      <span className="spider-body" />
      <span className="spider-head">
        <span className="spider-eye spider-eye-l" />
        <span className="spider-eye spider-eye-r" />
        <span className="spider-mouth" />
      </span>
    </div>
  )
}

function Doll() {
  return (
    <div className="seasonal-doll">
      <span className="doll-hair" />
      <span className="doll-bun bun-l" />
      <span className="doll-bun bun-r" />
      <span className="doll-face">
        <span className="doll-eye doll-eye-l" />
        <span className="doll-eye doll-eye-r" />
        <span className="doll-blush blush-l" />
        <span className="doll-blush blush-r" />
        <span className="doll-mouth" />
      </span>
      <span className="doll-dress" />
      <span className="doll-collar" />
      <span className="doll-arm arm-l" />
      <span className="doll-arm arm-r" />
      <span className="doll-shoe shoe-l" />
      <span className="doll-shoe shoe-r" />
    </div>
  )
}

function Monkey() {
  return (
    <div className="seasonal-monkey">
      <span className="monkey-ear ear-l" />
      <span className="monkey-ear ear-r" />
      <span className="monkey-head">
        <span className="monkey-muzzle" />
        <span className="monkey-eye eye-l" />
        <span className="monkey-eye eye-r" />
        <span className="monkey-smile" />
      </span>
      <span className="monkey-body" />
      <span className="monkey-arm arm-l" />
      <span className="monkey-arm arm-r" />
      <span className="monkey-foot foot-l" />
      <span className="monkey-foot foot-r" />
      <span className="monkey-tail" />
    </div>
  )
}

function Lamp() {
  return (
    <div className="seasonal-lamp">
      <span className="lamp-glow" />
      <span className="lamp-socket" />
      <span className="lamp-shade" />
      <span className="lamp-rim" />
      <span className="lamp-bulb" />
    </div>
  )
}

function Pumpkin() {
  return (
    <div className="seasonal-pumpkin">
      <span className="pumpkin-glow" />
      <span className="pumpkin-stem" />
      <span className="pumpkin-body" />
      <span className="pumpkin-face">
        <span className="pumpkin-eye pumpkin-eye-l" />
        <span className="pumpkin-eye pumpkin-eye-r" />
        <span className="pumpkin-mouth" />
      </span>
    </div>
  )
}

function Candle() {
  return (
    <div className="seasonal-candle">
      <span className="candle-halo" />
      <span className="candle-flame" />
      <span className="candle-wick" />
      <span className="candle-wax" />
      <span className="candle-drip drip-l" />
      <span className="candle-drip drip-r" />
    </div>
  )
}

function Creature({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'spider':
      return <Spider />
    case 'doll':
      return <Doll />
    case 'monkey':
      return <Monkey />
    case 'lamp':
      return <Lamp />
    case 'pumpkin':
      return <Pumpkin />
    case 'candle':
      return <Candle />
  }
}

export default function SeasonalDrop({
  className = '',
  thread = 88,
}: {
  className?: string
  thread?: number
}) {
  const { dark, mounted } = useTheme()
  const [pick, setPick] = useState<{ variant: Variant; id: number } | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!mounted) return
    const pool = dark ? DARK_VARIANTS : LIGHT_VARIANTS
    setPick((prev) => ({
      variant: pool[Math.floor(Math.random() * pool.length)],
      id: (prev?.id ?? 0) + 1,
    }))
  }, [dark, mounted])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!pick) return null

  return (
    <div aria-hidden="true" className={`seasonal-drop pointer-events-none select-none ${className}`}>
      <div key={pick.id} className="seasonal-drop-motion">
        <div className="seasonal-hang">
          <span className="seasonal-thread" style={{ height: thread }} />
          <div className="seasonal-creature">
            <Creature variant={pick.variant} />
          </div>
        </div>
      </div>
    </div>
  )
}
