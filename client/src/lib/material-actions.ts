export interface StudentMaterialView {
  id: string;
  title: string;
  url?: string | null;
}

interface MaterialDownloadMetadata {
  fileName?: string;
  fileSize?: number;
}

interface MaterialProgressTrackingPayload {
  scrollPercent: number;
  pageNumber?: number;
  pagesViewed?: number[];
  activeSeconds?: number;
}

interface MaterialViewEndTrackingPayload {
  timeSpentSeconds: number;
  finalScrollPercent: number;
  completed?: boolean;
  pageNumber?: number;
}

type TrackMaterialViewStart = (materialId: string) => Promise<unknown>;
type TrackMaterialDownload = (
  materialId: string,
  metadata?: MaterialDownloadMetadata
) => Promise<unknown>;
type OpenMaterialUrl = (url: string) => void;
type DownloadMaterialUrl = (url: string, fileName: string) => void;

interface MaterialActionDependencies {
  trackViewStart?: TrackMaterialViewStart;
  trackDownload?: TrackMaterialDownload;
  openUrl?: OpenMaterialUrl;
  downloadUrl?: DownloadMaterialUrl;
}

const toSafeFileName = (title: string): string => {
  const normalized = title.trim().replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '');
  if (normalized.length === 0) {
    return 'material';
  }
  return normalized.slice(0, 80);
};

const defaultTrackViewStart: TrackMaterialViewStart = async (materialId) => {
  await trackViewStart(materialId);
};

const defaultTrackDownload: TrackMaterialDownload = async (materialId, metadata) => {
  await trackDownload(materialId, metadata);
};

const defaultOpenUrl: OpenMaterialUrl = (url) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};

const defaultDownloadUrl: DownloadMaterialUrl = (url, fileName) => {
  if (typeof document === 'undefined') {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.download = fileName;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const triggerSafeTracking = (action: () => Promise<unknown>): void => {
  void action().catch(() => {
    // Tracking should never block the material open/download UX.
  });
};

const isOffline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

const enqueueProgressOnFailure = async (
  kind:
    | 'trackViewStart'
    | 'trackViewEnd'
    | 'trackDownload'
    | 'trackProgress',
  materialId: string,
  payload: Record<string, unknown>
): Promise<void> => {
  const { enqueueProgressEvent } = await import(
    '@/services/material-progress-queue.service'
  );
  enqueueProgressEvent(kind, materialId, payload);
};

export const trackViewStart = async (materialId: string): Promise<void> => {
  const payload = {
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  } as Record<string, unknown>;

  if (isOffline()) {
    await enqueueProgressOnFailure('trackViewStart', materialId, payload);
    return;
  }

  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackViewStart(materialId, payload as { user_agent?: string });
  } catch (error: any) {
    if (!error?.response) {
      // Looks like a network error; preserve the event for replay.
      await enqueueProgressOnFailure('trackViewStart', materialId, payload);
    }
  }
};

export const trackViewEnd = async (
  materialId: string,
  payload: MaterialViewEndTrackingPayload
): Promise<void> => {
  const apiPayload = {
    time_spent_seconds: Math.max(0, Math.round(payload.timeSpentSeconds)),
    final_scroll_percent: payload.finalScrollPercent,
    completed: payload.completed,
    page_number: payload.pageNumber,
  } as Record<string, unknown>;

  if (isOffline()) {
    await enqueueProgressOnFailure('trackViewEnd', materialId, apiPayload);
    return;
  }

  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackViewEnd(materialId, {
      time_spent_seconds: apiPayload.time_spent_seconds as number,
      final_scroll_percent: apiPayload.final_scroll_percent as number,
      completed: apiPayload.completed as boolean | undefined,
      page_number: apiPayload.page_number as number | undefined,
    });
  } catch (error: any) {
    if (!error?.response) {
      await enqueueProgressOnFailure('trackViewEnd', materialId, apiPayload);
    }
  }
};

export const trackDownload = async (
  materialId: string,
  metadata: MaterialDownloadMetadata = {}
): Promise<void> => {
  const apiPayload = {
    file_name: metadata.fileName,
    file_size: metadata.fileSize,
  } as Record<string, unknown>;

  if (isOffline()) {
    await enqueueProgressOnFailure('trackDownload', materialId, apiPayload);
    return;
  }

  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackDownload(materialId, {
      file_name: metadata.fileName,
      file_size: metadata.fileSize,
    });
  } catch (error: any) {
    if (!error?.response) {
      await enqueueProgressOnFailure('trackDownload', materialId, apiPayload);
    }
  }
};

export const trackScrollProgress = async (
  materialId: string,
  payload: MaterialProgressTrackingPayload
): Promise<void> => {
  const apiPayload = {
    scroll_percent: payload.scrollPercent,
    page_number: payload.pageNumber,
    pages_viewed: payload.pagesViewed,
    active_seconds: payload.activeSeconds,
  } as Record<string, unknown>;

  if (isOffline()) {
    await enqueueProgressOnFailure('trackProgress', materialId, apiPayload);
    return;
  }

  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackProgress(materialId, {
      scroll_percent: payload.scrollPercent,
      page_number: payload.pageNumber,
      pages_viewed: payload.pagesViewed,
      active_seconds: payload.activeSeconds,
    });
  } catch (error: any) {
    if (!error?.response) {
      await enqueueProgressOnFailure('trackProgress', materialId, apiPayload);
    }
  }
};

export const openMaterialWithTracking = (
  material: StudentMaterialView,
  deps: MaterialActionDependencies = {}
): boolean => {
  const url = material.url?.trim();
  if (!url) {
    return false;
  }

  const openUrl = deps.openUrl || defaultOpenUrl;
  const onTrackViewStart = deps.trackViewStart || defaultTrackViewStart;

  openUrl(url);
  triggerSafeTracking(() => onTrackViewStart(material.id));
  return true;
};

export const downloadMaterialWithTracking = (
  material: StudentMaterialView,
  deps: MaterialActionDependencies = {}
): boolean => {
  const url = material.url?.trim();
  if (!url) {
    return false;
  }

  const downloadUrl = deps.downloadUrl || defaultDownloadUrl;
  const onTrackDownload = deps.trackDownload || defaultTrackDownload;
  const fileName = toSafeFileName(material.title || 'material');

  downloadUrl(url, fileName);
  triggerSafeTracking(() => onTrackDownload(material.id, { fileName }));
  return true;
};

export const downloadAllMaterialsWithTracking = (
  materials: StudentMaterialView[],
  deps: MaterialActionDependencies = {}
): number => {
  let downloadedCount = 0;

  for (const material of materials) {
    if (downloadMaterialWithTracking(material, deps)) {
      downloadedCount += 1;
    }
  }

  return downloadedCount;
};
