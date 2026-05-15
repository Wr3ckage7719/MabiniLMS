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

// Several DB columns (assignments.due_date, submissions.submitted_at,
// submissions.graded_at, …) are still TIMESTAMP WITHOUT TIME ZONE, so
// Postgres returns them as naive strings like "2026-05-15T05:00:00".
// `new Date(naive)` would treat that as device-local time, shifting every
// rendered value by the user's offset. Treat naive datetimes as UTC so the
// PHT formatter produces the same wall-clock value the server intended.
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/;

export function parseServerDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? input : null;
  let value = input;
  if (value.includes('T') && !TZ_SUFFIX_RE.test(value)) {
    value = `${value}Z`;
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toDate(input: string | Date | null | undefined): Date | null {
  return parseServerDate(input);
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
