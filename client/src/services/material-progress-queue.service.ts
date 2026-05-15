import { apiClient } from './api-client';
import { createIdbQueue } from '@/lib/idb-queue';

const STORAGE_KEY = 'mabinilms:material-progress-queue:v1';
const QUEUE_EVENT = 'material-progress-queue:changed';

type ProgressKind =
  | 'updateMyProgress'
  | 'trackViewStart'
  | 'trackViewEnd'
  | 'trackDownload'
  | 'trackProgress';

interface QueuedProgressItem {
  id: string;
  kind: ProgressKind;
  materialId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
}

type QueuedProgressEntry = QueuedProgressItem & { __key: string };

const idbQueue = createIdbQueue<QueuedProgressEntry>({
  dbName: 'mabini-queues',
  storeName: 'material-progress',
  legacyLocalStorageKey: STORAGE_KEY,
  legacyParse: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.items || !Array.isArray(parsed.items)) return [];
      return parsed.items.map((item: QueuedProgressItem) => ({ ...item, __key: item.id }));
    } catch {
      return [];
    }
  },
  changeEventName: QUEUE_EVENT,
  broadcastChannel: 'mabini:queue',
});

export const ready = idbQueue.ready;

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `progress-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isOffline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

const endpointFor = (item: QueuedProgressItem): { method: 'put' | 'post'; url: string } => {
  switch (item.kind) {
    case 'updateMyProgress':
      return { method: 'put', url: `/materials/${item.materialId}/progress/me` };
    case 'trackViewStart':
      return { method: 'post', url: `/materials/${item.materialId}/track/view-start` };
    case 'trackViewEnd':
      return { method: 'post', url: `/materials/${item.materialId}/track/view-end` };
    case 'trackDownload':
      return { method: 'post', url: `/materials/${item.materialId}/track/download` };
    case 'trackProgress':
      return { method: 'post', url: `/materials/${item.materialId}/track/progress` };
  }
};

const tryRegisterBackgroundSync = async (tag: string): Promise<void> => {
  try {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    if (!('sync' in registration)) return;
    await (registration as any).sync.register(tag);
  } catch {
    // Silently ignore — Background Sync is a progressive enhancement.
  }
};

export const enqueueProgressEvent = (
  kind: ProgressKind,
  materialId: string,
  payload: Record<string, unknown>
): void => {
  const id = generateId();
  const item: QueuedProgressEntry = {
    __key: id,
    id,
    kind,
    materialId,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  idbQueue.upsert(id, item);
  void tryRegisterBackgroundSync('mabini-flush-progress');
};

export const getMaterialProgressQueue = (): QueuedProgressItem[] => {
  return idbQueue.getAll();
};

export const flushMaterialProgressQueue = async (): Promise<{ synced: number; remaining: number }> => {
  await ready;

  const initial = idbQueue.getAll();
  if (initial.length === 0) return { synced: 0, remaining: 0 };
  if (isOffline()) return { synced: 0, remaining: initial.length };

  let synced = 0;

  for (const item of initial) {
    const { method, url } = endpointFor(item);
    try {
      if (method === 'put') {
        await apiClient.put(url, item.payload);
      } else {
        await apiClient.post(url, item.payload);
      }
      idbQueue.remove(item.__key);
      synced += 1;
    } catch (error: any) {
      idbQueue.upsert(item.__key, { ...item, attempts: item.attempts + 1 });
      // Network/server error — try again later.
      if (!error?.response || isOffline()) break;
    }
  }

  return { synced, remaining: idbQueue.getAll().length };
};

export const subscribeToMaterialProgressQueue = (listener: () => void): (() => void) => {
  return idbQueue.subscribe(listener);
};
