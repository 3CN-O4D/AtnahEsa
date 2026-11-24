'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Navigation, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { isValidMapPoint, type ListingCoordinates, type MapPoint } from '@/lib/map-types'

const LeafletMap = dynamic(() => import('@/components/maps/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />,
})

export type MapCoordinates = ListingCoordinates

const KENYA_CENTER: MapPoint = { latitude: 0.0236, longitude: 37.9062 }

export default function LocationPicker({
  value,
  onChange,
}: {
  value: ListingCoordinates | null
  onChange: (value: ListingCoordinates | null) => void
}) {
  // While typing, keep the raw text so partial coordinates are not rewritten
  // mid-entry. Otherwise the text is derived from the saved value, which keeps
  // the fields correct when a parent loads or clears a pin asynchronously.
  const [draft, setDraft] = useState<{ latitude: string; longitude: string } | null>(null)
  const [showMap, setShowMap] = useState(Boolean(value))
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  const latitudeText = draft ? draft.latitude : value ? value.latitude.toFixed(6) : ''
  const longitudeText = draft ? draft.longitude : value ? value.longitude.toFixed(6) : ''

  const setPoint = (point: MapPoint, source: ListingCoordinates['source']) => {
    setError('')
    setDraft(null)
    onChange({ ...point, source })
    setShowMap(true)
  }

  const useCurrentLocation = () => {
    setError('')
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('This browser cannot share a location. Pick the point on the map instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPoint(
          {
            latitude: Number(coords.latitude.toFixed(6)),
            longitude: Number(coords.longitude.toFixed(6)),
          },
          'current'
        )
        setLocating(false)
      },
      (reason) => {
        setError(
          reason.code === 1
            ? 'Location permission was denied. Pick the point on the map instead.'
            : 'Could not read your location. Pick the point on the map instead.'
        )
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const updateText = (lat: string, lng: string) => {
    setError('')
    setDraft({ latitude: lat, longitude: lng })
    const candidate = { latitude: Number(lat), longitude: Number(lng) }
    if (lat.trim() && lng.trim() && isValidMapPoint(candidate)) {
      onChange({ ...candidate, source: 'manual' })
    } else {
      onChange(null)
    }
  }

  const center = value && isValidMapPoint(value) ? value : KENYA_CENTER

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-blue-700 dark:text-blue-300" />
        <p className="text-sm font-semibold text-gray-800 dark:text-white">Map location</p>
        {value && (
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Pin saved
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
        Add the exact house pin. Hunters see only an approximate area before payment; the pin and directions unlock after a verified payment.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} loading={locating}>
          <Navigation className="mr-1 h-3.5 w-3.5" /> Use my current location
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowMap((open) => !open)}>
          <MapPin className="mr-1 h-3.5 w-3.5" /> {showMap ? 'Hide map' : 'Pick a point on map'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(null)
              onChange(null)
              setShowMap(false)
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
          Latitude
          <input
            type="number"
            step="any"
            min="-90"
            max="90"
            value={latitudeText}
            onChange={(event) => updateText(event.target.value, longitudeText)}
            placeholder="-1.2921"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </label>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
          Longitude
          <input
            type="number"
            step="any"
            min="-180"
            max="180"
            value={longitudeText}
            onChange={(event) => updateText(latitudeText, event.target.value)}
            placeholder="36.8219"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

      {showMap && (
        <div className="mt-3">
          <LeafletMap
            center={center}
            zoom={value ? 16 : 6}
            marker={value ?? undefined}
            onPick={(point) => setPoint(point, 'map')}
            height={260}
          />
          <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            Click the map or drag the blue pin to adjust. You can also paste coordinates from Google Maps above.
          </p>
        </div>
      )}
    </div>
  )
}
