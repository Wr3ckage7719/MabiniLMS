/**
 * Canonical assignment / submission status logic mirrored on the client.
 *
 * Persisted statuses come from the server `submissions` table:
 *   draft | submitted | late | under_review | graded
 *
 * `pending`, `overdue` and `missed` are derived at read time. The server
 * already attaches a `derived_status` on the assignment list — this helper
 * is the fallback for views that don't carry it (admin/teacher previews,
 * cached payloads, offline reads).
 */

export type PersistedSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'late'
  | 'under_review'
  | 'graded';

export type DerivedAssignmentStatus =
  | PersistedSubmissionStatus
  | 'pending'
  | 'overdue'
  | 'missed';

export interface DerivedStatusInput {
  submissionStatus: string | null | undefined;
  dueDate: string | Date | null | undefined;
  submissionCloseAt?: string | Date | null;
  now?: Date;
}

// Naive TIMESTAMP columns (assignments.due_date, submissions.submitted_at,
// etc.) come back from Postgres without a Z marker. Default `new Date`
// parsing would treat them as device-local time, breaking the overdue
// comparison; normalise them as UTC the same way the formatter does.
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/;

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const normalized = value.includes('T') && !TZ_SUFFIX_RE.test(value) ? `${value}Z` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isPersisted = (status: unknown): status is PersistedSubmissionStatus => {
  return (
    status === 'submitted' ||
    status === 'late' ||
    status === 'under_review' ||
    status === 'graded'
  );
};

export function computeDerivedStatus(input: DerivedStatusInput): DerivedAssignmentStatus {
  const now = input.now ?? new Date();
  const status = input.submissionStatus;

  if (isPersisted(status)) {
    return status;
  }

  const due = toDate(input.dueDate);
  if (!due) {
    return 'pending';
  }

  if (now.getTime() <= due.getTime()) {
    return 'pending';
  }

  const closeAt = toDate(input.submissionCloseAt);
  if (closeAt && closeAt.getTime() < now.getTime()) {
    return 'missed';
  }

  return 'overdue';
}

export const isOpenForSubmission = (status: DerivedAssignmentStatus): boolean => {
  return status === 'pending' || status === 'overdue' || status === 'draft';
};

export const isFinalSubmissionStatus = (status: DerivedAssignmentStatus): boolean => {
  return (
    status === 'submitted' ||
    status === 'late' ||
    status === 'under_review' ||
    status === 'graded' ||
    status === 'missed'
  );
};
