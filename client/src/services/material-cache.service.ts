const SW_CACHE_MESSAGE = 'mabini:cache-material-urls';
const SW_PURGE_MESSAGE = 'mabini:purge-material-cache';

const getActiveServiceWorker = (): ServiceWorker | null => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  const registration = navigator.serviceWorker.controller;
  return registration ?? null;
};

const filterMaterialUrls = (urls: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of urls) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!/^https?:\/\//i.test(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

/**
 * Ask the active service worker to cache the given material URLs so the
 * student can re-open them offline. No-op when the SW isn't yet controlling
 * the page (first install) — the next page load will cover it.
 */
export const precacheMaterialUrls = (
  urls: Array<string | null | undefined>
): void => {
  const sw = getActiveServiceWorker();
  if (!sw) return;

  const targets = filterMaterialUrls(urls);
  if (targets.length === 0) return;

  try {
    sw.postMessage({ type: SW_CACHE_MESSAGE, urls: targets });
  } catch {
    // Best-effort: SW message failure should never break the page.
  }
};

/**
 * Drop every cached material file. Used when the student leaves a course or
 * we want to free storage after a major curriculum change. Pragmatic v1 calls
 * this manually; per-enrollment eviction is deferred.
 */
export const purgeMaterialCache = (): void => {
  const sw = getActiveServiceWorker();
  if (!sw) return;
  try {
    sw.postMessage({ type: SW_PURGE_MESSAGE });
  } catch {
    // Best-effort.
  }
};
