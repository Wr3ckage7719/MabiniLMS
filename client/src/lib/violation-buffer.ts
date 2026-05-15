import { createIdbQueue } from '@/lib/idb-queue';
import { examsService, type ProctorViolationType } from '@/services/exams.service';

interface QueuedViolation {
  __key: string;
  attemptId: string;
  violationType: ProctorViolationType;
  metadata: Record<string, unknown>;
  occurredAt: string;
  attempts: number;
}

const buffer = createIdbQueue<QueuedViolation>({
  dbName: 'mabini-queues',
  storeName: 'violations',
  changeEventName: 'violation-buffer:changed',
  broadcastChannel: 'mabini:violations',
});

export const reportViolationDurable = async (
  attemptId: string,
  violationType: ProctorViolationType,
  metadata: Record<string, unknown> = {}
): Promise<{ buffered: boolean; result?: Awaited<ReturnType<typeof examsService.reportExamViolation>> }> => {
  const enriched = { ...metadata, client_occurred_at: new Date().toISOString() };
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline) {
    const key = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    buffer.upsert(key, {
      __key: key,
      attemptId,
      violationType,
      metadata: enriched,
      occurredAt: enriched.client_occurred_at as string,
      attempts: 0,
    });
    return { buffered: true };
  }

  try {
    const result = await examsService.reportExamViolation(attemptId, {
      violation_type: violationType,
      metadata: enriched,
    });
    return { buffered: false, result };
  } catch {
    const key = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    buffer.upsert(key, {
      __key: key,
      attemptId,
      violationType,
      metadata: enriched,
      occurredAt: enriched.client_occurred_at as string,
      attempts: 0,
    });
    return { buffered: true };
  }
};

export const flushViolationBuffer = async (): Promise<{ synced: number; remaining: number }> => {
  await buffer.ready;
  const items = buffer.getAll();
  if (items.length === 0) return { synced: 0, remaining: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: items.length };
  }

  let synced = 0;
  for (const item of items) {
    try {
      await examsService.reportExamViolation(item.attemptId, {
        violation_type: item.violationType,
        metadata: item.metadata,
      });
      buffer.remove(item.__key);
      synced++;
    } catch {
      buffer.upsert(item.__key, { ...item, attempts: item.attempts + 1 });
      break; // bail on first failure to avoid hammering
    }
  }
  return { synced, remaining: buffer.getAll().length };
};

export const getQueuedViolationCount = (): number => buffer.getAll().length;

export const subscribeToViolationBuffer = (listener: () => void): (() => void) =>
  buffer.subscribe(listener);
