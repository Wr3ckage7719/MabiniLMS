// Service Worker for Mabini Classroom PWA
const CACHE_NAME = 'mabini-classroom-v3';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json'
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests (don't cache)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone response for caching
        const responseClone = response.clone();
        
        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // If it's a navigation request, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

const toAbsoluteUrl = (url) => {
  try {
    return new URL(url || '/dashboard', self.location.origin).toString();
  } catch {
    return new URL('/dashboard', self.location.origin).toString();
  }
};

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'Mabini Classroom',
        body: event.data.text(),
      };
    }
  }

  const title = payload.title || 'Mabini Classroom';
  const body = payload.body || 'You have a new update.';
  const url = payload.url || payload.data?.url || '/dashboard';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon || '/icons/icon-192x192.png',
      badge: payload.badge || '/icons/notification-badge-96x96.png',
      tag: payload.tag || 'mabini-notification',
      data: {
        url,
        notificationId: payload.data?.notificationId || null,
      },
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = toAbsoluteUrl(event.notification.data?.url || '/dashboard');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      windowClients.forEach((client) => {
        client.postMessage({ type: 'mabini:push-subscription-changed' });
      });
    })
  );
});
