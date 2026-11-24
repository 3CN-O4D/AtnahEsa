'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { LayerGroup, Map as LeafletMapInstance } from 'leaflet'
import type { MapPoint } from '@/lib/map-types'

type Props = {
  center: MapPoint
  zoom?: number
  marker?: MapPoint | null
  circle?: { center: MapPoint; radius: number } | null
  onPick?: (point: MapPoint) => void
  height?: number
  className?: string
}

/**
 * Client-only Leaflet wrapper. Leaflet touches `window` at import time, so the
 * library is loaded inside useEffect and callers import this component through
 * next/dynamic with `ssr: false`.
 */
export default function LeafletMap({
  center,
  zoom = 15,
  marker,
  circle,
  onPick,
  height = 260,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMapInstance | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  const initialRef = useRef({ center, zoom })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  useEffect(() => {
    let cancelled = false
    let map: LeafletMapInstance | null = null

    void import('leaflet').then((module) => {
      const L = (module.default ?? module) as typeof import('leaflet')
      if (cancelled || !containerRef.current || mapRef.current) return

      const first = initialRef.current
      map = L.map(containerRef.current, {
        center: [first.center.latitude, first.center.longitude],
        zoom: first.zoom,
        scrollWheelZoom: false,
        attributionControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      layerRef.current = L.layerGroup().addTo(map)
      map.on('click', (event) => {
        onPickRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng })
      })

      mapRef.current = map
      setReady(true)
      requestAnimationFrame(() => map?.invalidateSize())
    })

    return () => {
      cancelled = true
      if (map) map.remove()
      mapRef.current = null
      layerRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return
    let cancelled = false

    void import('leaflet').then((module) => {
      const L = (module.default ?? module) as typeof import('leaflet')
      if (cancelled || !mapRef.current || !layerRef.current) return

      const layer = layerRef.current
      layer.clearLayers()

      if (circle) {
        L.circle([circle.center.latitude, circle.center.longitude], {
          radius: circle.radius,
          color: '#1d4ed8',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.16,
        }).addTo(layer)
      }

      if (marker) {
        const icon = L.divIcon({
          className: 'asehanta-map-pin',
          html:
            '<div style="width:30px;height:30px;border-radius:999px;background:#1d4ed8;border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.45);display:grid;place-items:center;color:white;font:bold 12px sans-serif">A</div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        })
        const pin = L.marker([marker.latitude, marker.longitude], {
          icon,
          draggable: Boolean(onPick),
          title: 'House location',
        }).addTo(layer)
        if (onPick) {
          pin.on('dragend', () => {
            const latlng = pin.getLatLng()
            onPickRef.current?.({ latitude: latlng.lat, longitude: latlng.lng })
          })
        }
      }

      mapRef.current.setView([center.latitude, center.longitude], zoom)
      requestAnimationFrame(() => mapRef.current?.invalidateSize())
    })

    return () => {
      cancelled = true
    }
  }, [ready, center, zoom, marker, circle, onPick])

  return (
    <div
      ref={containerRef}
      className={`z-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800 ${className}`}
      style={{ height }}
      aria-label="House location map"
    />
  )
}
