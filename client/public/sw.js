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

const isSvgIconAsset = (value) => {
  return typeof value === 'string' && /\.svg(?:\?|#|$)/i.test(value);
};

const resolveNotificationIcon = (value) => {
  if (!value || isSvgIconAsset(value)) {
    return '/icons/icon-192x192.png';
  }

  return value;
};

const resolveNotificationBadge = (value) => {
  if (!value || isSvgIconAsset(value)) {
    return '/icons/notification-badge-96x96.png';
  }

  return value;
};

const PUSH_NOTIFICATION_DEDUP_TTL_MS = 30000;
const recentPushNotificationKeys = new Map();

const buildPushNotificationDedupeKey = ({ notificationId, tag, title, body }) => {
  if (notificationId) {
    return `id:${notificationId}`;
  }

  return `${tag}|${title}|${body}`.toLowerCase();
};

const isRecentPushNotification = (dedupeKey) => {
  const now = Date.now();

  recentPushNotificationKeys.forEach((seenAt, key) => {
    if (now - seenAt > PUSH_NOTIFICATION_DEDUP_TTL_MS) {
      recentPushNotificationKeys.delete(key);
    }
  });

  const previousSeenAt = recentPushNotificationKeys.get(dedupeKey);
  if (typeof previousSeenAt === 'number') {
    return true;
  }

  recentPushNotificationKeys.set(dedupeKey, now);
  return false;
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
  const notificationId = payload.data?.notificationId || null;
  const tag = payload.tag || (notificationId ? `notification-${notificationId}` : 'mabini-notification');
  const dedupeKey = buildPushNotificationDedupeKey({
    notificationId,
    tag,
    title,
    body,
  });

  event.waitUntil(
    (async () => {
      if (isRecentPushNotification(dedupeKey)) {
        return;
      }

      if (typeof self.registration.getNotifications === 'function') {
        const existingNotifications = await self.registration.getNotifications({ tag });
        const isDuplicate = existingNotifications.some((notification) => {
          if (notificationId) {
            return notification.data?.notificationId === notificationId;
          }

          return notification.title === title && notification.body === body;
        });

        if (isDuplicate) {
          return;
        }
      }

      await self.registration.showNotification(title, {
        body,
        icon: resolveNotificationIcon(payload.icon),
        badge: resolveNotificationBadge(payload.badge),
        tag,
        data: {
          url,
          notificationId,
        },
        renotify: false,
      });
    })()
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
