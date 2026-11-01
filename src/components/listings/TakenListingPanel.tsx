import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TakenListingPanelProps {
  /** True once the 48-hour window has passed and the media was purged. */
  mediaPurged: boolean
  className?: string
}

/**
 * Neat, text-only presentation for a house that has been taken. Replaces the
 * photo area on cards and on the listing detail page: once media is purged
 * (48 hours after the house was taken) this is all that remains, so taken
 * houses stay informative without serving any images.
 */
export default function TakenListingPanel({ mediaPurged, className }: TakenListingPanelProps) {
  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center gap-2.5 overflow-hidden bg-gradient-to-br from-red-50 via-rose-50 to-red-100 px-4 text-center dark:from-red-950/50 dark:via-rose-950/40 dark:to-red-950/60',
        className
      )}
    >
      {/* Soft decorative wash, pure CSS so it respects reduced-motion and needs no assets. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(130% 130% at 50% -10%, rgba(255,255,255,0.55), transparent 55%)' }}
      />
      <div aria-hidden="true" className="hero-orb -left-12 -top-10 h-40 w-40 bg-red-400/20 dark:bg-red-500/10" />
      <div aria-hidden="true" className="hero-orb -bottom-14 -right-10 h-44 w-44 bg-rose-400/20 dark:bg-rose-500/10" />

      <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm ring-1 ring-red-200/80 backdrop-blur dark:bg-slate-900/70 dark:ring-red-900/60">
        <Lock className="h-5 w-5 text-red-500 dark:text-red-400" />
      </span>

      <div className="relative space-y-1">
        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">This home has been taken</p>
        <p className="mx-auto max-w-[24ch] text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {mediaPurged
            ? 'Photos were removed 48 hours after it was taken.'
            : 'It is no longer available for booking.'}
        </p>
      </div>
    </div>
  )
}
