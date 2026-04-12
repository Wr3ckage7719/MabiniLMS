import { apiClient } from './api-client';

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
  const response = await apiClient.get<{ data?: { public_key?: string } }>(
    '/notifications/push/public-key'
  );

  const publicKey = response?.data?.public_key;
  if (!publicKey) {
    throw new Error('Web Push public key is not available from server');
  }

  return publicKey;
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
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
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

    const notificationData = {
      url: options?.url || '/dashboard',
      notificationId: options?.notificationId,
    };

    if (registration && typeof registration.showNotification === 'function') {
      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-192x192.svg',
        tag: options?.tag || 'mabini-notification',
        data: notificationData,
      });
      return;
    }

    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      tag: options?.tag || 'mabini-notification',
      data: notificationData,
    });

    notification.onclick = () => {
      if (notificationData.url) {
        window.location.href = notificationData.url;
      }
      notification.close();
    };
  },
};
