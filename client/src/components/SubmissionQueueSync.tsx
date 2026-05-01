import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  flushSubmissionQueue,
  getSubmissionQueueCount,
  subscribeToSubmissionQueue,
} from '@/services/submission-queue.service';
import {
  flushMaterialProgressQueue,
  subscribeToMaterialProgressQueue,
} from '@/services/material-progress-queue.service';

const FAILURE_TOAST_COOLDOWN_MS = 2 * 60 * 1000;
const SYNC_POLL_INTERVAL_MS = 30 * 1000;

export default function SubmissionQueueSync() {
  const { toast } = useToast();
  const isSyncingRef = useRef(false);
  const lastFailureToastRef = useRef(0);

  const runSync = useCallback(async (showSuccessToast: boolean) => {
    if (isSyncingRef.current) {
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }

    if (getSubmissionQueueCount() === 0) {
      return;
    }

    isSyncingRef.current = true;

    try {
      // LM progress events ride alongside submissions: same trigger, same
      // online/offline gate. Errors in the progress queue are swallowed —
      // they're best-effort engagement telemetry.
      void flushMaterialProgressQueue().catch(() => undefined);

      const result = await flushSubmissionQueue();

      if (showSuccessToast && result.synced > 0) {
        const suffix = result.synced === 1 ? '' : 's';
        toast({
          title: 'Queued submissions synced',
          description: `${result.synced} queued submission${suffix} synced successfully.`,
        });
      }

      if (result.failed > 0 && result.remaining > 0) {
        const now = Date.now();
        if (now - lastFailureToastRef.current >= FAILURE_TOAST_COOLDOWN_MS) {
          const suffix = result.remaining === 1 ? '' : 's';
          toast({
            title: 'Some queued submissions need attention',
            description: `${result.remaining} queued submission${suffix} could not be synced yet.`,
            variant: 'destructive',
          });
          lastFailureToastRef.current = now;
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    void runSync(false);

    const handleOnline = () => {
      void runSync(true);
    };

    const stopQueueSubscription = subscribeToSubmissionQueue(() => {
      void runSync(false);
    });
    const stopProgressSubscription = subscribeToMaterialProgressQueue(() => {
      void flushMaterialProgressQueue().catch(() => undefined);
    });

    const intervalId = window.setInterval(() => {
      void runSync(false);
    }, SYNC_POLL_INTERVAL_MS);

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      stopQueueSubscription();
      stopProgressSubscription();
      window.clearInterval(intervalId);
    };
  }, [runSync]);

  return null;
}
