import { apiClient } from './api-client';

const STORAGE_KEY = 'mabinilms:submission-queue:v1';
const QUEUE_EVENT = 'submission-queue:changed';

export interface SubmissionRequestPayload {
  provider?: 'google_drive';
  provider_file_id?: string;
  provider_file_name?: string;
  drive_file_id?: string;
  drive_file_name?: string;
  content?: string;
  sync_key: string;
  // Device-side timestamp captured at the moment Submit was tapped. Carried
  // through the queue so an offline submission keeps its original "submitted
  // at" once the sync engine drains it.
  client_submitted_at?: string;
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

const normalizeQueuePayload = (
  payload: Omit<SubmissionRequestPayload, 'sync_key'> & { sync_key?: string },
  syncKey: string
): SubmissionRequestPayload => {
  const providerFileId = payload.provider_file_id || payload.drive_file_id;
  if (!providerFileId) {
    throw new Error('Queued submission is missing a file reference.');
  }

  const providerFileName = payload.provider_file_name || payload.drive_file_name;

  return {
    provider: 'google_drive',
    provider_file_id: providerFileId,
    provider_file_name: providerFileName,
    // Preserve legacy aliases for compatibility with in-flight payload consumers.
    drive_file_id: providerFileId,
    drive_file_name: providerFileName,
    content: payload.content,
    sync_key: syncKey,
    client_submitted_at: payload.client_submitted_at,
  };
};

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
  const payloadWithClientTimestamp = {
    ...input.payload,
    client_submitted_at: input.payload.client_submitted_at || now,
  };
  const payload = normalizeQueuePayload(payloadWithClientTimestamp, syncKey);

  const queuedSubmission: QueuedSubmission = {
    syncKey,
    assignmentId: input.assignmentId,
    courseId: input.courseId,
    payload,
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
      const payload = normalizeQueuePayload(currentItem.payload, currentItem.syncKey);
      await apiClient.post(`/assignments/${currentItem.assignmentId}/submit`, payload);
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
