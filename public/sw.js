// WITHOUT EQUAL — Service Worker
// Handles offline caching + push notifications

const CACHE_NAME = 'we-readiness-v1'

// Pages/assets to cache for offline use
const PRECACHE_URLS = ['/']

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Fetch (network-first, fallback to cache) ─────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET, supabase, and API calls — always hit network for these
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('supabase') ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful HTML responses for offline fallback
        if (response.ok && event.request.headers.get('accept')?.includes('text/html')) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// ── Push Notification ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'WITHOUT EQUAL', body: event.data.text() }
  }

  const options = {
    body: data.body ?? 'Daily readiness reminder',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'daily-readiness',
    renotify: false,
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: data.url ?? '/' },
    actions: [
      { action: 'open', title: 'Report Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WITHOUT EQUAL · Daily Readiness', options)
  )
})

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const targetUrl = event.notification.data?.url ?? '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl)
      })
  )
})
