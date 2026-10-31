/**
 * Tiny in-process TTL cache for read-heavy API routes.
 *
 * Supabase REST calls from the Vercel functions can take several seconds when
 * the connection is cold. Public listing/search payloads change slowly, so we
 * keep the last successful response in memory for a short window and dedupe
 * concurrent identical loads. Each serverless instance has its own cache; the
 * CDN headers on the routes add the shared layer.
 */

type Entry<T> = {
  value: T
  expiresAt: number
}

const globalForCache = globalThis as typeof globalThis & {
  __asehantaServerCache?: Map<string, Entry<unknown>>
  __asehantaServerInflight?: Map<string, Promise<unknown>>
}

const store = globalForCache.__asehantaServerCache ?? new Map<string, Entry<unknown>>()
const inflight = globalForCache.__asehantaServerInflight ?? new Map<string, Promise<unknown>>()

if (process.env.NODE_ENV !== 'production') {
  globalForCache.__asehantaServerCache = store
  globalForCache.__asehantaServerInflight = inflight
}

const MAX_ENTRIES = 400

function prune(now: number) {
  if (store.size < MAX_ENTRIES) return
  for (const [key, entry] of store) {
    if (now >= entry.expiresAt) store.delete(key)
  }
  // Still too big? Drop the oldest entries (Map preserves insertion order).
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (Date.now() >= entry.expiresAt) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function setCached<T>(key: string, value: T, ttlMs: number): T {
  const now = Date.now()
  prune(now)
  store.set(key, { value, expiresAt: now + ttlMs })
  return value
}

/** Read through the cache, sharing an in-flight promise for identical keys. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const hit = getCached<T>(key)
  if (hit !== undefined) return hit

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = loader()
    .then((value) => {
      setCached(key, value, ttlMs)
      return value
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  return promise
}

export function invalidateCached(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
