import { apiClient } from './api-client';
import { createIdbQueue } from '@/lib/idb-queue';

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

type QueuedSubmissionEntry = QueuedSubmission & { __key: string };

const idbQueue = createIdbQueue<QueuedSubmissionEntry>({
  dbName: 'mabini-queues',
  storeName: 'submissions',
  legacyLocalStorageKey: STORAGE_KEY,
  legacyParse: (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.items || !Array.isArray(parsed.items)) return [];
      return parsed.items.map((item: QueuedSubmission) => ({ ...item, __key: item.syncKey }));
    } catch {
      return [];
    }
  },
  changeEventName: QUEUE_EVENT,
  broadcastChannel: 'mabini:queue',
});

export const ready = idbQueue.ready;

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
  return idbQueue.getAll();
};

export const getSubmissionQueueCount = (): number => {
  return idbQueue.getAll().length;
};

export const subscribeToSubmissionQueue = (listener: () => void): (() => void) => {
  return idbQueue.subscribe(listener);
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

  // Check if there's an existing submission for this assignment+course and
  // replace it, mirroring the previous localStorage-based dedup logic.
  const existing = idbQueue.getAll().find(
    (item) => item.assignmentId === input.assignmentId && item.courseId === input.courseId
  );
  if (existing) {
    idbQueue.remove(existing.__key);
  }
  idbQueue.upsert(syncKey, { ...queuedSubmission, __key: syncKey });

  void tryRegisterBackgroundSync('mabini-flush-submissions');

  return queuedSubmission;
};

// For use in tests only — clears the in-memory mirror so tests can start fresh
// without needing to reset modules or delete the IDB database.
export const __clearQueueStateForTesting = (): void => idbQueue.replaceAll([]);

export const flushSubmissionQueue = async (): Promise<QueueSyncResult> => {
  await ready;

  const initialQueue = idbQueue.getAll();
  if (initialQueue.length === 0) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  if (isOffline()) {
    return { synced: 0, failed: 0, remaining: initialQueue.length };
  }

  let synced = 0;
  let failed = 0;

  for (const queuedItem of initialQueue) {
    const currentItem = idbQueue.getAll().find((item) => item.__key === queuedItem.__key);
    if (!currentItem) continue;

    idbQueue.upsert(currentItem.__key, { ...currentItem, status: 'syncing' });

    try {
      const payload = normalizeQueuePayload(currentItem.payload, currentItem.syncKey);
      await apiClient.post(`/assignments/${currentItem.assignmentId}/submit`, payload);
      idbQueue.remove(currentItem.__key);
      synced++;
    } catch (error: any) {
      failed++;
      idbQueue.upsert(currentItem.__key, {
        ...currentItem,
        status: 'failed',
        attempts: currentItem.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
        lastError: formatQueueError(error),
      });

      if (!error?.response || isOffline()) {
        break;
      }
    }
  }

  if (idbQueue.getAll().length > 0) {
    void tryRegisterBackgroundSync('mabini-flush-submissions');
  }

  return {
    synced,
    failed,
    remaining: getSubmissionQueueCount(),
  };
};
