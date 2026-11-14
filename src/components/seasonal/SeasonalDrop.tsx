'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

/**
 * Seasonal hanging decoration for the home + auth pages.
 *
 * Holiday season (Thanksgiving → Christmas). Dark mode drops a glowing bauble,
 * star, snowflake, bell, candy cane or lantern. Light mode drops a blue bauble,
 * gingerbread cookie, pinecone, star, snowflake, bell or candy cane. Shapes are
 * pure CSS so they look the same on every platform, they are `aria-hidden`,
 * they never capture clicks, and the whole thing only appears once the theme
 * has been resolved so it never flashes the wrong family. All motion lives
 * behind a reduced-motion override.
 */

type Variant =
  | 'bauble-red'
  | 'bauble-blue'
  | 'bauble-gold'
  | 'star'
  | 'snowflake'
  | 'bell'
  | 'candycane'
  | 'gingerbread'
  | 'pinecone'
  | 'lantern'

const DARK_VARIANTS: Variant[] = ['bauble-red', 'bauble-gold', 'star', 'snowflake', 'bell', 'candycane', 'lantern']
const LIGHT_VARIANTS: Variant[] = ['bauble-blue', 'gingerbread', 'pinecone', 'star', 'snowflake', 'bell', 'candycane']

const FLAKE_ANGLES = [0, 30, 60, 90, 120, 150]

function Bauble({ tone }: { tone: 'red' | 'blue' | 'gold' }) {
  return (
    <div className={`seasonal-bauble bauble-${tone}`}>
      <span className="bauble-loop" />
      <span className="bauble-cap" />
      <span className="bauble-ball">
        <span className="bauble-shine" />
      </span>
    </div>
  )
}

function Star() {
  return (
    <div className="seasonal-star">
      <span className="star-halo" />
      <span className="star-body" />
    </div>
  )
}

function Snowflake() {
  return (
    <div className="seasonal-snowflake">
      {FLAKE_ANGLES.map((angle) => (
        <span
          key={angle}
          className="flake-arm"
          style={{ transform: `rotate(${angle}deg)` } as CSSProperties}
        />
      ))}
      <span className="flake-core" />
    </div>
  )
}

function Bell() {
  return (
    <div className="seasonal-bell">
      <span className="bell-bow" />
      <span className="bell-body" />
      <span className="bell-rim" />
      <span className="bell-clapper" />
    </div>
  )
}

function CandyCane() {
  return (
    <div className="seasonal-candycane">
      <span className="cane-hook" />
      <span className="cane-stick" />
    </div>
  )
}

function Gingerbread() {
  return (
    <div className="seasonal-gingerbread">
      <span className="ginger-arm arm-l" />
      <span className="ginger-arm arm-r" />
      <span className="ginger-leg leg-l" />
      <span className="ginger-leg leg-r" />
      <span className="ginger-body" />
      <span className="ginger-head">
        <span className="ginger-eye eye-l" />
        <span className="ginger-eye eye-r" />
        <span className="ginger-smile" />
      </span>
      <span className="ginger-button btn-1" />
      <span className="ginger-button btn-2" />
    </div>
  )
}

function Pinecone() {
  return (
    <div className="seasonal-pinecone">
      <span className="pinecone-stem" />
      <span className="pinecone-body" />
    </div>
  )
}

function Lantern() {
  return (
    <div className="seasonal-lantern">
      <span className="lantern-halo" />
      <span className="lantern-handle" />
      <span className="lantern-top" />
      <span className="lantern-glass" />
      <span className="lantern-base" />
    </div>
  )
}

function Creature({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'bauble-red':
      return <Bauble tone="red" />
    case 'bauble-blue':
      return <Bauble tone="blue" />
    case 'bauble-gold':
      return <Bauble tone="gold" />
    case 'star':
      return <Star />
    case 'snowflake':
      return <Snowflake />
    case 'bell':
      return <Bell />
    case 'candycane':
      return <CandyCane />
    case 'gingerbread':
      return <Gingerbread />
    case 'pinecone':
      return <Pinecone />
    case 'lantern':
      return <Lantern />
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
