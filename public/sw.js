const swUrl = new URL(self.location.href)
const cacheVersion = swUrl.searchParams.get('v') || 'phase1'
const staticCacheName = `jhbiofarm-static-${cacheVersion}`
const staticCachePrefix = 'jhbiofarm-static-'
const staticPathPrefixes = [
  '/_nuxt/',
  '/icons/',
]
const staticPathnames = new Set([
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/goodforpat.png',
  '/jhbiofarm-logo.png',
])

function isStaticAssetRequest(request, url) {
  if (request.method !== 'GET') return false
  if (url.origin !== self.location.origin) return false
  if (url.pathname.startsWith('/api/')) return false
  if (request.mode === 'navigate') return false

  if (staticPathnames.has(url.pathname)) return true
  if (staticPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) return true

  return ['style', 'script', 'font', 'image'].includes(request.destination)
}

async function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return response
  }

  const cache = await caches.open(staticCacheName)
  await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(staticCacheName)
  const cachedResponse = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => putInCache(request, response))
    .catch(() => cachedResponse)

  return cachedResponse || networkPromise
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys()
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith(staticCachePrefix) && key !== staticCacheName)
        .map((key) => caches.delete(key)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (!isStaticAssetRequest(event.request, requestUrl)) return

  event.respondWith(staleWhileRevalidate(event.request))
})
