/* AseHanta app shell: deliberately tiny and network-first. */
const CACHE_NAME = 'asehanta-offline-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET' || request.mode !== 'navigate') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME)
      return (await cache.match(OFFLINE_URL)) || Response.error()
    })
  )
})
