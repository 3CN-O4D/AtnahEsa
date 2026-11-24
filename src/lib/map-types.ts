export type MapCoordinateSource = 'manual' | 'current' | 'map'

export type MapPoint = {
  latitude: number
  longitude: number
}

export type ListingCoordinates = MapPoint & {
  source: MapCoordinateSource
}

export type LocationLinks = {
  googleMaps: string
  openStreetMap: string
  googleDirections: string
  openStreetMapDirections: string
}

export type ApproximateListingLocation = {
  hasLocation: boolean
  label: string
  center?: MapPoint
  radius?: number
}

export type ExactListingLocation = {
  hasLocation: boolean
  label: string
  location?: MapPoint
  links?: LocationLinks
}

export function isValidMapPoint(value: unknown): value is MapPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Partial<MapPoint>
  return (
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    point.longitude >= -180 &&
    point.longitude <= 180
  )
}

export function buildLocationLinks(point: MapPoint): LocationLinks {
  const lat = point.latitude.toFixed(6)
  const lng = point.longitude.toFixed(6)
  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`,
    openStreetMap: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
    googleDirections: `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}&travelmode=driving`,
    openStreetMapDirections: `https://www.openstreetmap.org/directions?to=${lng}%2C${lat}`,
  }
}
