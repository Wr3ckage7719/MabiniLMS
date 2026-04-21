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
  const { materialsService } = await import('@/services/materials.service');
  await materialsService.trackViewStart(materialId, {});
};

const defaultTrackDownload: TrackMaterialDownload = async (materialId, metadata) => {
  const { materialsService } = await import('@/services/materials.service');
  await materialsService.trackDownload(materialId, {
    file_name: metadata?.fileName,
    file_size: metadata?.fileSize,
  });
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

export const trackViewStart = async (materialId: string): Promise<void> => {
  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackViewStart(materialId, {
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  } catch {
    // Tracking is best effort only.
  }
};

export const trackViewEnd = async (
  materialId: string,
  payload: MaterialViewEndTrackingPayload
): Promise<void> => {
  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackViewEnd(materialId, {
      time_spent_seconds: Math.max(0, Math.round(payload.timeSpentSeconds)),
      final_scroll_percent: payload.finalScrollPercent,
      completed: payload.completed,
      page_number: payload.pageNumber,
    });
  } catch {
    // Tracking is best effort only.
  }
};

export const trackDownload = async (
  materialId: string,
  metadata: MaterialDownloadMetadata = {}
): Promise<void> => {
  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackDownload(materialId, {
      file_name: metadata.fileName,
      file_size: metadata.fileSize,
    });
  } catch {
    // Tracking is best effort only.
  }
};

export const trackScrollProgress = async (
  materialId: string,
  payload: MaterialProgressTrackingPayload
): Promise<void> => {
  try {
    const { materialsService } = await import('@/services/materials.service');
    await materialsService.trackProgress(materialId, {
      scroll_percent: payload.scrollPercent,
      page_number: payload.pageNumber,
      pages_viewed: payload.pagesViewed,
      active_seconds: payload.activeSeconds,
    });
  } catch {
    // Tracking is best effort only.
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
