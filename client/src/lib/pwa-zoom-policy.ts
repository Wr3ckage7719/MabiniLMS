export type PwaMobileZoomPolicyPreference = 'auto' | 'enabled' | 'disabled';

export const PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY = 'mabini:pwa-mobile-zoom-policy';
export const PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT = 'mabini:pwa-mobile-zoom-policy-changed';
export const AUTH_ROLE_CACHE_STORAGE_KEY = 'mabini:auth-role-cache';

const normalizeRole = (role?: string | null): string => {
  return (role || '').trim().toLowerCase();
};

export const getRoleBasedDefaultZoomLock = (role?: string | null): boolean => {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'student') {
    return true;
  }

  return false;
};

export const readCachedAuthRole = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cachedRole = localStorage.getItem(AUTH_ROLE_CACHE_STORAGE_KEY);
    return cachedRole ? normalizeRole(cachedRole) : null;
  } catch {
    return null;
  }
};

const dispatchZoomPolicyChangeEvent = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT));
};

export const cacheAuthRole = (role?: string | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedRole = normalizeRole(role);

  try {
    if (normalizedRole.length > 0) {
      localStorage.setItem(AUTH_ROLE_CACHE_STORAGE_KEY, normalizedRole);
    } else {
      localStorage.removeItem(AUTH_ROLE_CACHE_STORAGE_KEY);
    }
  } catch {
    return;
  }

  dispatchZoomPolicyChangeEvent();
};

export const readPwaMobileZoomPolicyPreference = (): PwaMobileZoomPolicyPreference => {
  if (typeof window === 'undefined') {
    return 'auto';
  }

  try {
    const rawValue = localStorage.getItem(PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY);
    if (rawValue === 'enabled' || rawValue === 'disabled' || rawValue === 'auto') {
      return rawValue;
    }
  } catch {
    return 'auto';
  }

  return 'auto';
};

export const writePwaMobileZoomPolicyPreference = (value: PwaMobileZoomPolicyPreference) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY, value);
  } catch {
    return;
  }

  dispatchZoomPolicyChangeEvent();
};

export const resolveShouldLockPwaMobileZoom = (roleOverride?: string | null): boolean => {
  const preference = readPwaMobileZoomPolicyPreference();

  if (preference === 'enabled') {
    return true;
  }

  if (preference === 'disabled') {
    return false;
  }

  const resolvedRole = normalizeRole(roleOverride || readCachedAuthRole());
  return getRoleBasedDefaultZoomLock(resolvedRole);
};
