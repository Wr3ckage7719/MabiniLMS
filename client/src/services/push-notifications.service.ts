import { apiClient } from './api-client';
import { supabase } from '@/lib/supabase';

const SERVICE_WORKER_PATH = '/sw.js';

const isBrowser = (): boolean => typeof window !== 'undefined';

const isSecureContextForPush = (): boolean => {
  if (!isBrowser()) {
    return false;
  }

  if (window.isSecureContext) {
    return true;
  }

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

const getPlatformHint = (): string => {
  if (!isBrowser()) {
    return 'unknown';
  }

  const userAgentData = navigator.userAgentData as { platform?: string } | undefined;
  if (userAgentData?.platform) {
    return userAgentData.platform;
  }

  return navigator.platform || 'unknown';
};

const sanitizeVapidKey = (key: string): string => {
  return key
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '');
};

const toNormalizedErrorMessage = (error: unknown): string => {
  return (error instanceof Error ? error.message : String(error || '')).toLowerCase();
};

const isPushSubscriptionRetryableError = (error: unknown): boolean => {
  const message = toNormalizedErrorMessage(error);
  return (
    message.includes('push service error') ||
    message.includes('registration failed') ||
    message.includes('networkerror') ||
    message.includes('aborterror') ||
    message.includes('timeout') ||
    message.includes('service unavailable')
  );
};

const toApplicationServerKey = (rawKey: string): Uint8Array => {
  const key = sanitizeVapidKey(rawKey);
  const parsed = urlBase64ToUint8Array(key);

  // VAPID public keys should decode to an uncompressed P-256 public key (65 bytes).
  if (parsed.length !== 65) {
    throw new Error(
      'Web Push public key is invalid. Please contact the administrator to regenerate VAPID keys.'
    );
  }

  return parsed;
};

type ApiErrorShape = {
  error?: {
    message?: string;
    code?: string;
  };
};

const extractApiErrorMessage = (error: unknown): string => {
  const responseData = (error as { response?: { data?: ApiErrorShape } })?.response?.data;
  return responseData?.error?.message || (error instanceof Error ? error.message : '');
};

export const getPushEnableErrorMessage = (error: unknown): string => {
  const apiMessage = extractApiErrorMessage(error);
  const rawMessage = apiMessage || (error instanceof Error ? error.message : '');
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('web push is not configured')) {
    return 'Push notifications are not configured on the server yet. Please contact your administrator.';
  }

  if (normalized.includes('push subscription storage is unavailable')) {
    return 'Push notification storage is not ready on the server. Ask your administrator to run migration 015_web_push_subscriptions.';
  }

  if (
    normalized.includes('public key is invalid') ||
    normalized.includes('vapid')
  ) {
    return 'Push key configuration is invalid. Please contact your administrator to update Web Push keys.';
  }

  if (
    normalized.includes('push service error') ||
    normalized.includes('registration failed')
  ) {
    return 'Browser push service rejected registration. If you use Brave, disable Shields for this site and allow notifications, then try again.';
  }

  if (normalized.includes('failed to register push subscription')) {
    return 'Could not save this device for push notifications. Please try again, and contact your administrator if it keeps failing.';
  }

  if (normalized.includes('not supported')) {
    return 'Push notifications are not supported on this browser/device.';
  }

  return rawMessage || 'Push notifications could not be enabled on this device.';
};

const fetchPublicVapidKeyFromSameOrigin = async (): Promise<string | null> => {
  if (!isBrowser()) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch('/api/notifications/push/public-key', {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: { public_key?: string }; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || `Failed to load Web Push public key (${response.status})`;
    throw new Error(message);
  }

  return payload?.data?.public_key || null;
};

const toSerializableSubscription = (subscription: PushSubscription) => {
  const json = subscription.toJSON();

  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription payload returned by browser');
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh,
      auth,
    },
  };
};

const postSubscriptionToServer = async (subscription: PushSubscription): Promise<void> => {
  const serializable = toSerializableSubscription(subscription);

  await apiClient.post('/notifications/push/subscribe', {
    subscription: serializable,
    user_agent: navigator.userAgent,
    platform: getPlatformHint(),
  });
};

const getPublicVapidKey = async (): Promise<string> => {
  try {
    const response = await apiClient.get<{ data?: { public_key?: string } }>(
      '/notifications/push/public-key'
    );

    const publicKey = response?.data?.public_key;
    if (publicKey) {
      return sanitizeVapidKey(publicKey);
    }
  } catch (error) {
    const message = extractApiErrorMessage(error).toLowerCase();
    const routeMissing = message.includes('route get /api/notifications/push/public-key not found');

    // Fallback to same-origin API in case VITE_API_URL points to an out-of-date backend.
    if (routeMissing) {
      try {
        const fallbackKey = await fetchPublicVapidKeyFromSameOrigin();
        if (fallbackKey) {
          return sanitizeVapidKey(fallbackKey);
        }
      } catch (fallbackError) {
        const fallbackMessage = extractApiErrorMessage(fallbackError);
        throw new Error(
          fallbackMessage ||
            'Push notifications backend route is missing. Deploy the latest server and verify your API URL points to that deployment.'
        );
      }

      throw new Error(
        'Push notifications backend route is missing. Deploy the latest server and verify your API URL points to that deployment.'
      );
    }

    if (message.includes('web push is not configured')) {
      throw new Error(
        'Web Push is not configured on the server. Set WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_SUBJECT.'
      );
    }

    throw error instanceof Error ? error : new Error('Failed to load Web Push public key');
  }

  throw new Error('Web Push public key is not available from server');
};

const subscribeWithKey = async (
  registration: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> => {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toApplicationServerKey(publicKey),
  });
};

const resetPushRegistrationState = async (
  registration: ServiceWorkerRegistration
): Promise<void> => {
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await registration.update();
  } catch {
    // Best-effort cleanup only.
  }
};

const requestPermission = async (): Promise<NotificationPermission> => {
  if (!isBrowser() || !('Notification' in window)) {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
};

const LOCAL_NOTIFICATION_DEDUP_TTL_MS = 20_000;
const localNotificationSeenAt = new Map<string, number>();

const buildLocalNotificationDedupeKey = (
  title: string,
  body: string,
  tag: string,
  notificationId?: string
): string => {
  if (notificationId) {
    return `id:${notificationId}`;
  }

  return `${tag}|${title}|${body}`.toLowerCase();
};

const isRecentLocalNotification = (dedupeKey: string): boolean => {
  const now = Date.now();

  localNotificationSeenAt.forEach((seenAt, key) => {
    if (now - seenAt > LOCAL_NOTIFICATION_DEDUP_TTL_MS) {
      localNotificationSeenAt.delete(key);
    }
  });

  const seenAt = localNotificationSeenAt.get(dedupeKey);
  if (typeof seenAt === 'number') {
    return true;
  }

  localNotificationSeenAt.set(dedupeKey, now);
  return false;
};

export const pushNotificationsService = {
  isSupported(): boolean {
    if (!isBrowser()) {
      return false;
    }

    return (
      isSecureContextForPush() &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  getPermission(): NotificationPermission {
    if (!isBrowser() || !('Notification' in window)) {
      return 'denied';
    }

    return Notification.permission;
  },

  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!isBrowser() || !('serviceWorker' in navigator)) {
      return null;
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
    }

    await navigator.serviceWorker.ready;
    return registration;
  },

  async syncExistingSubscription(): Promise<boolean> {
    if (!this.isSupported() || this.getPermission() !== 'granted') {
      return false;
    }

    const registration = await this.registerServiceWorker();
    if (!registration) {
      return false;
    }

    const existing = await registration.pushManager.getSubscription();
    if (!existing) {
      return false;
    }

    await postSubscriptionToServer(existing);
    return true;
  },

  async enablePushNotifications(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('Push notifications are not supported on this browser/device');
    }

    const permission = await requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    const registration = await this.registerServiceWorker();
    if (!registration) {
      throw new Error('Service worker registration failed for push notifications');
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const publicKey = await getPublicVapidKey();
      try {
        subscription = await subscribeWithKey(registration, publicKey);
      } catch (initialSubscribeError) {
        if (!isPushSubscriptionRetryableError(initialSubscribeError)) {
          throw initialSubscribeError;
        }

        await resetPushRegistrationState(registration);

        // Retry once with same-origin key as a compatibility fallback for split API deployments.
        let retryKey = publicKey;
        try {
          const sameOriginKey = await fetchPublicVapidKeyFromSameOrigin();
          if (sameOriginKey) {
            retryKey = sanitizeVapidKey(sameOriginKey);
          }
        } catch {
          // Keep previously fetched key for retry.
        }

        subscription = await subscribeWithKey(registration, retryKey);
      }
    }

    await postSubscriptionToServer(subscription);
    return true;
  },

  async disablePushNotifications(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    const registration = await this.registerServiceWorker();
    if (!registration) {
      return;
    }

    const existing = await registration.pushManager.getSubscription();
    if (!existing) {
      return;
    }

    await apiClient.post('/notifications/push/unsubscribe', {
      endpoint: existing.endpoint,
    });

    await existing.unsubscribe();
  },

  async showLocalNotification(
    title: string,
    body: string,
    options?: {
      url?: string;
      tag?: string;
      notificationId?: string;
    }
  ): Promise<void> {
    if (!this.isSupported() || this.getPermission() !== 'granted') {
      return;
    }

    const registration = await this.registerServiceWorker();
    const notificationTag =
      options?.tag ||
      (options?.notificationId ? `notification-${options.notificationId}` : 'mabini-notification');
    const dedupeKey = buildLocalNotificationDedupeKey(
      title,
      body,
      notificationTag,
      options?.notificationId
    );

    if (isRecentLocalNotification(dedupeKey)) {
      return;
    }

    const notificationData = {
      url: options?.url || '/dashboard',
      notificationId: options?.notificationId,
    };

    if (registration && typeof registration.showNotification === 'function') {
      if (typeof registration.getNotifications === 'function') {
        const existingNotifications = await registration.getNotifications({ tag: notificationTag });
        const isDuplicate = existingNotifications.some((notification) => {
          if (options?.notificationId) {
            return notification.data?.notificationId === options.notificationId;
          }

          return notification.title === title && notification.body === body;
        });

        if (isDuplicate) {
          return;
        }
      }

      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/notification-badge-96x96.png',
        tag: notificationTag,
        data: notificationData,
        renotify: false,
      });
      return;
    }

    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/notification-badge-96x96.png',
      tag: notificationTag,
      data: notificationData,
      renotify: false,
    });

    notification.onclick = () => {
      if (notificationData.url) {
        window.location.href = notificationData.url;
      }
      notification.close();
    };
  },
};
