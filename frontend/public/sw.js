// Minimal app-shell service worker so the audit wizard opens with no network.
// It caches the built page and its hashed /assets files, and never touches /api
// (offline data lives in IndexedDB, see src/lib/offlineStore.js).
const CACHE = 'retailsync-shell-v2'

// Install files: the manifest and icons, so the installed app has them offline.
const STATIC_FILES = [
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
]

// Cache the page, the install files and every /assets file the page names.
async function precache() {
  const cache = await caches.open(CACHE)
  const res = await fetch('/', { cache: 'reload' })
  const html = await res.clone().text()
  await cache.put('/', res)
  const files = [...new Set([...STATIC_FILES, ...(html.match(/\/assets\/[^"'\s]+/g) || [])])]
  await Promise.all(files.map((f) => cache.add(f).catch(() => {})))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Page loads: try the network (fresh deploys), fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Built files have hashed names: cached copy first, store new ones as seen.
  // The manifest and icons are served the same way.
  if (url.pathname.startsWith('/assets/') || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy))
        return res
      })),
    )
  }
})
