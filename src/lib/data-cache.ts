const cache = new Map<string, { data: unknown; timestamp: number }>()
const DEFAULT_TTL = 60000

export function getCached<T>(key: string, maxAge = DEFAULT_TTL): T | null {
  const entry = cache.get(key)
  if (!entry || Date.now() - entry.timestamp > maxAge) {
    if (entry) cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache<T>(key: string, data: T) {
  cache.set(key, { data, timestamp: Date.now() })
}

export function clearCache(pattern?: string) {
  if (!pattern) { cache.clear(); return }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key)
  }
}
