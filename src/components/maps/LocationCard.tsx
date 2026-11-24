'use client'

import dynamic from 'next/dynamic'
import { ExternalLink, Info, MapPin, Navigation } from 'lucide-react'
import type { LocationLinks, MapPoint } from '@/lib/map-types'

const LeafletMap = dynamic(() => import('@/components/maps/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />,
})

type Props = {
  center: MapPoint
  label?: string
  radius?: number
  exact?: boolean
  links?: LocationLinks
  height?: number
}

const linkClass =
  'inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40'

/** Shared map card: approximate circle before payment, exact pin after. */
export default function LocationCard({ center, label, radius, exact = false, links, height = 220 }: Props) {
  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-blue-800 dark:text-blue-300">
          <MapPin className="h-3.5 w-3.5" />
          {exact ? 'Exact house location unlocked' : 'Approximate area'}
        </p>
        {links?.googleDirections && (
          <a href={links.googleDirections} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Navigation className="h-3 w-3" /> Get directions
          </a>
        )}
      </div>

      {label && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{label}</p>}

      <div className="mt-2">
        <LeafletMap
          center={center}
          zoom={exact ? 16 : 13}
          marker={exact ? center : undefined}
          circle={!exact && radius ? { center, radius } : undefined}
          height={height}
        />
      </div>

      {links && (
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={links.googleMaps} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink className="h-3 w-3" /> Open in Google Maps
          </a>
          <a href={links.openStreetMap} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink className="h-3 w-3" /> OpenStreetMap
          </a>
          <a href={links.openStreetMapDirections} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Navigation className="h-3 w-3" /> OSM directions
          </a>
        </div>
      )}

      {!exact && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          The exact pin is hidden until your payment is verified. This circle only shows the general area.
        </p>
      )}
    </div>
  )
}
