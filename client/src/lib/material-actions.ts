export interface StudentMaterialView {
  id: string;
  title: string;
  url?: string | null;
}

type TrackMaterialView = (materialId: string, lastViewedAt: string) => Promise<unknown>;
type OpenMaterialUrl = (url: string) => void;
type DownloadMaterialUrl = (url: string, fileName: string) => void;

interface MaterialActionDependencies {
  trackView?: TrackMaterialView;
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

const defaultTrackView: TrackMaterialView = async (materialId, lastViewedAt) => {
  const { materialsService } = await import('@/services/materials.service');
  await materialsService.updateMyProgress(materialId, {
    last_viewed_at: lastViewedAt,
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

const triggerTracking = (trackView: TrackMaterialView, materialId: string): void => {
  const lastViewedAt = new Date().toISOString();
  void trackView(materialId, lastViewedAt).catch(() => {
    // Tracking should never block the material open/download UX.
  });
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
  const trackView = deps.trackView || defaultTrackView;

  openUrl(url);
  triggerTracking(trackView, material.id);
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
  const trackView = deps.trackView || defaultTrackView;
  const fileName = toSafeFileName(material.title || 'material');

  downloadUrl(url, fileName);
  triggerTracking(trackView, material.id);
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
