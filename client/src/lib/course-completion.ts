import type { Assignment } from './data';

export interface CourseCompletion {
  /** 0-100, integer. 0 if there are no assignments yet. */
  percent: number;
  completed: number;
  total: number;
  /** Soonest unsubmitted assignment, or null when nothing is left. */
  nextItem: Assignment | null;
}

/**
 * Computes per-course completion from the student's assignment list. Phase 1
 * counts an assignment as "completed" when it is `submitted` or `graded`.
 * Materials are not yet folded in — the per-material progress endpoint is
 * per-material and would require N requests on the dashboard. Phase 2's
 * `completion_policy` will let teachers customize this rule.
 */
export function computeCourseCompletion(assignments: Assignment[]): CourseCompletion {
  const total = assignments.length;
  if (total === 0) {
    return { percent: 0, completed: 0, total: 0, nextItem: null };
  }

  const completed = assignments.filter(
    (a) => a.status === 'submitted' || a.status === 'graded'
  ).length;

  const open = assignments
    .filter((a) => a.status !== 'submitted' && a.status !== 'graded')
    .filter((a) => {
      const due = new Date(a.dueDate).getTime();
      return Number.isFinite(due);
    })
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return {
    percent: Math.round((completed / total) * 100),
    completed,
    total,
    nextItem: open[0] ?? null,
  };
}

/**
 * Bucket many assignments by classId once, so a dashboard rendering N cards
 * doesn't filter the whole array N times.
 */
export function groupAssignmentsByClass(
  assignments: Assignment[]
): Map<string, Assignment[]> {
  const map = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const list = map.get(assignment.classId);
    if (list) {
      list.push(assignment);
    } else {
      map.set(assignment.classId, [assignment]);
    }
  }
  return map;
}

/**
 * Human-readable countdown ("Due in 2 days", "Due in 4 hours", "Overdue").
 * Returns `null` when the input isn't a parseable date.
 */
export function formatDueCountdown(dueDateIso: string | null | undefined): {
  label: string;
  tone: 'overdue' | 'soon' | 'normal' | 'none';
} | null {
  if (!dueDateIso) return null;
  const due = new Date(dueDateIso).getTime();
  if (!Number.isFinite(due)) return null;

  const diffMs = due - Date.now();
  if (diffMs < 0) {
    return { label: 'Overdue', tone: 'overdue' };
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 2) {
    return { label: `Due in ${days} days`, tone: 'normal' };
  }
  if (days === 1) {
    return { label: 'Due tomorrow', tone: 'soon' };
  }
  if (hours >= 1) {
    return { label: `Due in ${hours} hour${hours === 1 ? '' : 's'}`, tone: 'soon' };
  }
  if (minutes >= 1) {
    return {
      label: `Due in ${minutes} minute${minutes === 1 ? '' : 's'}`,
      tone: 'soon',
    };
  }
  return { label: 'Due any minute', tone: 'soon' };
}
