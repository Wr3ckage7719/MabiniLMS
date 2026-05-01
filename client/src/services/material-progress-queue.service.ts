import { apiClient } from './api-client';

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

interface QueueState {
  version: 1;
  items: QueuedProgressItem[];
}

const defaultQueueState = (): QueueState => ({ version: 1, items: [] });

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const notifyChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
};

const readState = (): QueueState => {
  if (!canUseStorage()) return defaultQueueState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultQueueState();
    const parsed = JSON.parse(raw) as QueueState;
    if (!parsed || !Array.isArray(parsed.items)) return defaultQueueState();
    return { version: 1, items: parsed.items };
  } catch {
    return defaultQueueState();
  }
};

const writeState = (state: QueueState): void => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyChanged();
};

const updateState = (updater: (items: QueuedProgressItem[]) => QueuedProgressItem[]): void => {
  const current = readState();
  writeState({ version: 1, items: updater(current.items) });
};

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

export const enqueueProgressEvent = (
  kind: ProgressKind,
  materialId: string,
  payload: Record<string, unknown>
): void => {
  const item: QueuedProgressItem = {
    id: generateId(),
    kind,
    materialId,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  updateState((items) => [...items, item]);
};

export const getMaterialProgressQueue = (): QueuedProgressItem[] => {
  return readState().items;
};

export const flushMaterialProgressQueue = async (): Promise<{ synced: number; remaining: number }> => {
  const initial = getMaterialProgressQueue();
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
      updateState((items) => items.filter((existing) => existing.id !== item.id));
      synced += 1;
    } catch (error: any) {
      updateState((items) =>
        items.map((existing) =>
          existing.id === item.id
            ? { ...existing, attempts: existing.attempts + 1 }
            : existing
        )
      );
      // Network/server error — try again later. Don't keep hammering on a
      // dead connection.
      if (!error?.response || isOffline()) break;
    }
  }

  return { synced, remaining: getMaterialProgressQueue().length };
};

export const subscribeToMaterialProgressQueue = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(QUEUE_EVENT, handler);
  return () => window.removeEventListener(QUEUE_EVENT, handler);
};
