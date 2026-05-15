// Mabini LMS is operated from the Philippines, so submission, exam-attempt
// and proctor-violation timestamps are rendered in Asia/Manila by default.
// If a user-configurable timezone is ever added (profiles.timezone), thread
// it through this helper rather than calling Date.toLocaleString() ad-hoc.
export const APP_TIME_ZONE = 'Asia/Manila';
export const APP_TIME_ZONE_LABEL = 'PHT';

// en-GB pins the format to DD/MM/YYYY with 24-hour time across all ICU
// versions. en-PH yields different orderings depending on the ICU build
// (Node yields M/D/Y, mobile JSI yields D/M/Y) — pinning the locale here
// keeps server output, web, and mobile UIs identical.
const FORMAT_LOCALE = 'en-GB';

const dateTimeFmt = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateOnlyFmt = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeOnlyFmt = new Intl.DateTimeFormat(FORMAT_LOCALE, {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  const d = typeof input === 'string' ? new Date(input) : input;
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatDateTime(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return `${dateTimeFmt.format(d)} ${APP_TIME_ZONE_LABEL}`;
}

export function formatDateTimeShort(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return dateTimeFmt.format(d);
}

export function formatDateOnly(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return dateOnlyFmt.format(d);
}

export function formatTimeOnly(input: string | Date | null | undefined, fallback = '—'): string {
  const d = toDate(input);
  if (!d) return fallback;
  return timeOnlyFmt.format(d);
}
