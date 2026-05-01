import { useEffect, useMemo, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  flushSubmissionQueue,
  getSubmissionQueue,
  subscribeToSubmissionQueue,
  type QueuedSubmission,
} from '@/services/submission-queue.service';

const formatRelativeTime = (isoTimestamp: string): string => {
  const queuedAt = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(queuedAt)) {
    return 'just now';
  }

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - queuedAt) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const statusLabel = (status: QueuedSubmission['status']): string => {
  switch (status) {
    case 'syncing':
      return 'Syncing';
    case 'failed':
      return 'Failed';
    case 'queued':
    default:
      return 'Queued';
  }
};

interface Props {
  buttonClassName?: string;
}

export function OfflineSubmissionTray({ buttonClassName }: Props) {
  const [queue, setQueue] = useState<QueuedSubmission[]>(() => getSubmissionQueue());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToSubmissionQueue(() => {
      setQueue(getSubmissionQueue());
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const pendingCount = queue.length;
  const hasFailures = useMemo(
    () => queue.some((item) => item.status === 'failed'),
    [queue]
  );

  // Don't render anything when there's nothing to surface AND we're online —
  // it's a tray for the abnormal state, not chrome.
  if (pendingCount === 0 && isOnline) {
    return null;
  }

  const handleSyncNow = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await flushSubmissionQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerLabel = pendingCount > 0
    ? `${pendingCount} pending submission${pendingCount === 1 ? '' : 's'}`
    : 'You are offline';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${buttonClassName ?? ''}`}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <CloudOff className={`h-5 w-5 ${hasFailures ? 'text-destructive' : ''}`} />
          {pendingCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                hasFailures
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Offline submissions</div>
              <div className="text-xs text-muted-foreground">
                {isOnline ? 'Online' : 'Offline'}
                {pendingCount > 0 ? ` — ${pendingCount} waiting to sync` : ''}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!isOnline || pendingCount === 0 || isSyncing}
              onClick={handleSyncNow}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync now
            </Button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {queue.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              You're offline, but no submissions are waiting. Anything you submit will queue here automatically.
            </div>
          ) : (
            <ul className="divide-y">
              {queue.map((item) => (
                <li key={item.syncKey} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.payload.provider_file_name
                          || item.payload.drive_file_name
                          || 'Submission'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Queued {formatRelativeTime(item.queuedAt)}
                        {item.attempts > 0 ? ` • ${item.attempts} retr${item.attempts === 1 ? 'y' : 'ies'}` : ''}
                      </div>
                      {item.lastError && (
                        <div className="text-xs text-destructive mt-1 line-clamp-2">
                          {item.lastError}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap ${
                        item.status === 'failed'
                          ? 'bg-destructive/10 text-destructive'
                          : item.status === 'syncing'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {statusLabel(item.status)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default OfflineSubmissionTray;
