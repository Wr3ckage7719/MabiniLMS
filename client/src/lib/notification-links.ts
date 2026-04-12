type NotificationMetadata = Record<string, unknown> | null | undefined;

export type NotificationRole = 'student' | 'teacher';

export interface NotificationLinkResult {
  href: string;
  external: boolean;
}

const getCourseId = (metadata: NotificationMetadata): string | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const maybeCourseId = (metadata as Record<string, unknown>).course_id;
  if (typeof maybeCourseId === 'string' && maybeCourseId.trim().length > 0) {
    return maybeCourseId;
  }

  const maybeCourseIdCamel = (metadata as Record<string, unknown>).courseId;
  if (typeof maybeCourseIdCamel === 'string' && maybeCourseIdCamel.trim().length > 0) {
    return maybeCourseIdCamel;
  }

  return null;
};

const mapPathToAppRoute = (pathname: string, metadata: NotificationMetadata): string => {
  if (pathname.startsWith('/class/')) {
    return pathname;
  }

  if (pathname.startsWith('/courses/')) {
    const courseId = pathname.split('/').filter(Boolean)[1];
    if (courseId) {
      return `/class/${courseId}`;
    }
  }

  if (pathname.startsWith('/assignments/')) {
    const courseId = getCourseId(metadata);
    if (courseId) {
      return `/class/${courseId}`;
    }
  }

  if (pathname === '/courses') {
    return '/dashboard';
  }

  if (pathname === '/' || pathname === '/index.html') {
    return '/dashboard';
  }

  return pathname;
};

const fallbackPathForRole = (role?: NotificationRole): string => {
  return role === 'teacher' ? '/teacher' : '/dashboard';
};

export const resolveNotificationLink = (
  actionUrl: string | null | undefined,
  metadata: NotificationMetadata,
  role?: NotificationRole
): NotificationLinkResult => {
  const fallbackPath = fallbackPathForRole(role);
  const courseId = getCourseId(metadata);

  if (!actionUrl || !actionUrl.trim()) {
    if (courseId) {
      return { href: `/class/${courseId}`, external: false };
    }

    return { href: fallbackPath, external: false };
  }

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://mabinilms.local';
    const parsed = new URL(actionUrl, baseOrigin);

    if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
      return {
        href: parsed.toString(),
        external: true,
      };
    }

    const mappedPath = mapPathToAppRoute(parsed.pathname, metadata);
    const finalPath = `${mappedPath}${parsed.search}${parsed.hash}`;

    return {
      href: finalPath || fallbackPath,
      external: false,
    };
  } catch {
    if (courseId) {
      return { href: `/class/${courseId}`, external: false };
    }

    return { href: fallbackPath, external: false };
  }
};
