import { apiClient } from './api-client';

const STORAGE_KEY = 'mabinilms:submission-queue:v1';
const QUEUE_EVENT = 'submission-queue:changed';

export interface SubmissionRequestPayload {
  drive_file_id?: string;
  drive_file_name?: string;
  content?: string;
  sync_key: string;
}

export interface QueuedSubmission {
  syncKey: string;
  assignmentId: string;
  courseId: string;
  payload: SubmissionRequestPayload;
  status: 'queued' | 'syncing' | 'failed';
  attempts: number;
  queuedAt: string;
  lastAttemptAt?: string;
  lastError?: string;
}

interface QueueState {
  version: 1;
  items: QueuedSubmission[];
}

export interface QueueSyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

interface EnqueueSubmissionInput {
  assignmentId: string;
  courseId: string;
  payload: Omit<SubmissionRequestPayload, 'sync_key'> & { sync_key?: string };
}

const defaultQueueState = (): QueueState => ({ version: 1, items: [] });

const canUseStorage = (): boolean => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const notifyQueueChanged = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
};

const readQueueState = (): QueueState => {
  if (!canUseStorage()) {
    return defaultQueueState();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return defaultQueueState();

    const parsedValue = JSON.parse(rawValue) as QueueState;
    if (!parsedValue || !Array.isArray(parsedValue.items)) {
      return defaultQueueState();
    }

    return {
      version: 1,
      items: parsedValue.items,
    };
  } catch {
    return defaultQueueState();
  }
};

const writeQueueState = (state: QueueState): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  notifyQueueChanged();
};

const updateQueueState = (updater: (items: QueuedSubmission[]) => QueuedSubmission[]): void => {
  const current = readQueueState();
  const nextItems = updater(current.items);
  writeQueueState({ version: 1, items: nextItems });
};

const formatQueueError = (error: any): string => {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    'Submission sync failed'
  );
};

const isOffline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

export const createSubmissionSyncKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const getSubmissionQueue = (): QueuedSubmission[] => {
  return readQueueState().items;
};

export const getSubmissionQueueCount = (): number => {
  return getSubmissionQueue().length;
};

export const subscribeToSubmissionQueue = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const eventListener = () => listener();
  window.addEventListener(QUEUE_EVENT, eventListener);

  return () => {
    window.removeEventListener(QUEUE_EVENT, eventListener);
  };
};

export const enqueueSubmission = (input: EnqueueSubmissionInput): QueuedSubmission => {
  const syncKey = input.payload.sync_key || createSubmissionSyncKey();
  const now = new Date().toISOString();

  const queuedSubmission: QueuedSubmission = {
    syncKey,
    assignmentId: input.assignmentId,
    courseId: input.courseId,
    payload: {
      drive_file_id: input.payload.drive_file_id,
      drive_file_name: input.payload.drive_file_name,
      content: input.payload.content,
      sync_key: syncKey,
    },
    status: 'queued',
    attempts: 0,
    queuedAt: now,
  };

  updateQueueState((items) => {
    const existingIndex = items.findIndex(
      (item) => item.assignmentId === input.assignmentId && item.courseId === input.courseId
    );

    if (existingIndex >= 0) {
      const next = [...items];
      next[existingIndex] = queuedSubmission;
      return next;
    }

    return [...items, queuedSubmission];
  });

  return queuedSubmission;
};

const markSyncStatus = (syncKey: string, status: 'syncing' | 'failed', errorMessage?: string): void => {
  updateQueueState((items) =>
    items.map((item) => {
      if (item.syncKey !== syncKey) {
        return item;
      }

      return {
        ...item,
        status,
        attempts: status === 'failed' ? item.attempts + 1 : item.attempts,
        lastAttemptAt: new Date().toISOString(),
        lastError: errorMessage,
      };
    })
  );
};

const removeQueuedSubmission = (syncKey: string): void => {
  updateQueueState((items) => items.filter((item) => item.syncKey !== syncKey));
};

export const flushSubmissionQueue = async (): Promise<QueueSyncResult> => {
  const initialQueue = getSubmissionQueue();
  if (initialQueue.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  if (isOffline()) {
    return { synced: 0, failed: 0, remaining: initialQueue.length };
  }

  let synced = 0;
  let failed = 0;

  for (const queuedItem of initialQueue) {
    const currentQueue = getSubmissionQueue();
    const currentItem = currentQueue.find((item) => item.syncKey === queuedItem.syncKey);

    if (!currentItem) {
      continue;
    }

    markSyncStatus(currentItem.syncKey, 'syncing');

    try {
      await apiClient.post(`/assignments/${currentItem.assignmentId}/submit`, currentItem.payload);
      removeQueuedSubmission(currentItem.syncKey);
      synced++;
    } catch (error: any) {
      failed++;
      markSyncStatus(currentItem.syncKey, 'failed', formatQueueError(error));

      if (!error?.response || isOffline()) {
        break;
      }
    }
  }

  return {
    synced,
    failed,
    remaining: getSubmissionQueueCount(),
  };
};
