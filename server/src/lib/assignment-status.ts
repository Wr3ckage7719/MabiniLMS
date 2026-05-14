/**
 * Canonical assignment / submission status logic.
 *
 * Persisted statuses live on the `submissions` table:
 *   draft | submitted | late | under_review | graded
 *
 * `pending`, `overdue` and `missed` are *derived* at read time from the
 * combination of (submission row, due_date, submission window). They are
 * never stored, which means no backfill is ever required when due dates
 * shift.
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

const toDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
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

export const computeDerivedStatus = (input: DerivedStatusInput): DerivedAssignmentStatus => {
  const now = input.now ?? new Date();
  const status = input.submissionStatus;

  // Terminal-ish persisted states win — once a student has turned something in
  // or it's been graded, we trust the DB regardless of due_date drift.
  if (isPersisted(status)) {
    return status;
  }

  // From here on the student has either no submission row or only a draft.
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
};
