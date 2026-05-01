// Service Worker for Mabini Classroom PWA
const CACHE_NAME = 'mabini-classroom-v3';
const MATERIALS_CACHE_NAME = 'mabini-materials-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json'
];

// Material files larger than this are skipped during pre-cache to keep the
// student's device storage under control. Matches the pivot spec's pragmatic
// 50 MB ceiling for offline LM caching.
const MATERIAL_CACHE_MAX_BYTES = 50 * 1024 * 1024;

// In-memory whitelist of material URLs the page has registered with the SW.
// We persist it into the materials cache so it survives SW restarts.
const REGISTERED_MATERIALS_KEY = '/__mabini-registered-materials__';

const loadRegisteredMaterialUrls = async () => {
  try {
    const cache = await caches.open(MATERIALS_CACHE_NAME);
    const response = await cache.match(REGISTERED_MATERIALS_KEY);
    if (!response) return new Set();
    const data = await response.json();
    if (!Array.isArray(data)) return new Set();
    return new Set(data.filter((value) => typeof value === 'string'));
  } catch {
    return new Set();
  }
};

const saveRegisteredMaterialUrls = async (urlSet) => {
  try {
    const cache = await caches.open(MATERIALS_CACHE_NAME);
    const body = JSON.stringify(Array.from(urlSet));
    await cache.put(
      REGISTERED_MATERIALS_KEY,
      new Response(body, { headers: { 'Content-Type': 'application/json' } })
    );
  } catch {
    // Storage failures should never break navigation.
  }
};

const isMaterialRequest = async (request) => {
  if (request.method !== 'GET') return false;
  const registered = await loadRegisteredMaterialUrls();
  return registered.has(request.url);
};

const cacheMaterialUrl = async (url) => {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) return false;

    const contentLengthHeader = response.headers.get('Content-Length');
    const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
    if (Number.isFinite(contentLength) && contentLength > MATERIAL_CACHE_MAX_BYTES) {
      return false;
    }

    const cache = await caches.open(MATERIALS_CACHE_NAME);
    await cache.put(url, response.clone());
    return true;
  } catch {
    return false;
  }
};

const handleCacheMaterialUrlsMessage = async (urls) => {
  if (!Array.isArray(urls)) return;

  const registered = await loadRegisteredMaterialUrls();
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    registered.add(url);
  }
  await saveRegisteredMaterialUrls(registered);

  // Best-effort: cache anything that isn't already cached.
  const cache = await caches.open(MATERIALS_CACHE_NAME);
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    const existing = await cache.match(url);
    if (existing) continue;
    await cacheMaterialUrl(url);
  }
};

const handlePurgeMaterialCacheMessage = async () => {
  await caches.delete(MATERIALS_CACHE_NAME);
};

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

// Activate event - clean up old caches but keep the materials cache alive
// across SW upgrades so already-downloaded LMs stay available offline.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== MATERIALS_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - network first for app shell; cache-first for registered
// material URLs so a student who has already opened a PDF/video online can
// keep reading it offline.
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests (don't cache)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(handleFetch(event.request));
});

const handleFetch = async (request) => {
  if (await isMaterialRequest(request)) {
    return handleMaterialFetch(request);
  }
  return handleAppShellFetch(request);
};

const handleMaterialFetch = async (request) => {
  const cache = await caches.open(MATERIALS_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in the background so updated material content propagates the
    // next time the student opens it online.
    fetch(request, { credentials: 'omit' })
      .then((response) => {
        if (response && response.status === 200) {
          const contentLengthHeader = response.headers.get('Content-Length');
          const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
          if (!Number.isFinite(contentLength) || contentLength <= MATERIAL_CACHE_MAX_BYTES) {
            cache.put(request, response.clone());
          }
        }
      })
      .catch(() => undefined);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const contentLengthHeader = response.headers.get('Content-Length');
      const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN;
      if (!Number.isFinite(contentLength) || contentLength <= MATERIAL_CACHE_MAX_BYTES) {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    return new Response('Material is not available offline yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};

const handleAppShellFetch = (request) => {
  return fetch(request)
    .then((response) => {
      const responseClone = response.clone();

      if (response.status === 200) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
      }

      return response;
    })
    .catch(() => {
      return caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }

        return new Response('Offline', { status: 503 });
      });
    });
};

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

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'mabini:cache-material-urls':
      event.waitUntil(handleCacheMaterialUrlsMessage(data.urls));
      break;
    case 'mabini:purge-material-cache':
      event.waitUntil(handlePurgeMaterialCacheMessage());
      break;
    default:
      break;
  }
});
