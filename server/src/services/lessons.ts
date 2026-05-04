import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';
import logger from '../utils/logger.js';

// ============================================
// Types
// ============================================

export type LessonStatus = 'locked' | 'active' | 'done' | 'draft';

export type LessonCompletionRule =
  | { type: 'view_all_files' }
  | { type: 'mark_as_done' }
  | { type: 'time_on_material'; min_minutes: number };

export interface LessonChain {
  next_lesson_id: string | null;
  unlock_on_submit: boolean;
  unlock_on_pass: boolean;
  pass_threshold_percent: number | null;
}

export interface LessonRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  topics: string[];
  sort_order: number;
  is_published: boolean;
  is_general: boolean;
  completion_rule_type: 'mark_as_done' | 'view_all_files' | 'time_on_material';
  completion_rule_min_minutes: number | null;
  next_lesson_id: string | null;
  unlock_on_submit: boolean;
  unlock_on_pass: boolean;
  pass_threshold_percent: number | null;
  created_at: string;
  updated_at: string;
}

export interface LessonMaterialRef {
  material_id: string;
  title: string;
  file_type: string;
  file_size: string;
  url: string | null;
  viewed: boolean;
  view_seconds: number;
  page_count: number | null;
}

export interface LessonAssessmentRef {
  assignment_id: string;
  title: string;
  raw_type: string;
  points: number;
  is_optional: boolean;
  submitted: boolean;
  graded: boolean;
  score_percent: number | null;
  due_date: string | null;
}

export interface LessonUnlockBlocker {
  lesson_id: string;
  lesson_title: string;
  reason: 'predecessor_not_done' | 'predecessor_assessment_pending' | 'predecessor_assessment_failed';
}

export interface LessonView {
  id: string;
  classId: string;
  ordering: number;
  title: string;
  description: string | null;
  topics: string[];
  isPublished: boolean;
  isGeneral: boolean;
  createdAt: string;
  completionRule: LessonCompletionRule;
  materials: LessonMaterialRef[];
  assessments: LessonAssessmentRef[];
  chain: LessonChain;
  status: LessonStatus;
  unlockBlocker: LessonUnlockBlocker | null;
  doneAt: string | null;
  stats?: { completed_students: number; total_students: number };
}

export interface UpsertLessonInput {
  title: string;
  description: string | null;
  topics: string[];
  isPublished: boolean;
  completionRule: LessonCompletionRule;
  chain: LessonChain;
}

// ============================================
// Authorization helpers
// ============================================

const loadCourseById = async (
  courseId: string
): Promise<{ id: string; teacher_id: string }> => {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
    }
    logger.error('Failed to load course for lesson access check', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify course', 500);
  }
  return data as { id: string; teacher_id: string };
};

export const assertCourseAccess = async (
  courseId: string,
  userId: string,
  role: 'student' | 'teacher' | 'admin' | 'student_or_teacher'
): Promise<{ isTeacher: boolean }> => {
  const course = await loadCourseById(courseId);
  const isAdmin = await isAdminUser(userId);
  if (isAdmin) {
    return { isTeacher: true };
  }
  const isTeacher = course.teacher_id === userId;

  if (role === 'teacher') {
    if (!isTeacher) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Only the owning teacher can manage lessons',
        403
      );
    }
    return { isTeacher: true };
  }

  if (role === 'student') {
    if (isTeacher) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Teachers cannot mark a lesson as done on a student\'s behalf',
        403
      );
    }
    await assertEnrolled(courseId, userId);
    return { isTeacher: false };
  }

  // student_or_teacher
  if (isTeacher) return { isTeacher: true };
  await assertEnrolled(courseId, userId);
  return { isTeacher: false };
};

const isAdminUser = async (userId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) return false;
  return (data as { role?: string } | null)?.role === 'admin';
};

const assertEnrolled = async (courseId: string, userId: string): Promise<void> => {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', userId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .limit(1);
  if (error) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify enrollment', 500);
  }
  if (!data || data.length === 0) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'You do not have access to this course', 403);
  }
};

// ============================================
// Loaders + assemblers
// ============================================

const loadLessonRowsForCourse = async (
  courseId: string,
  includeUnpublished: boolean
): Promise<LessonRow[]> => {
  let query = supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeUnpublished) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Failed to load lessons', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lessons', 500);
  }
  return (data ?? []) as LessonRow[];
};

const loadSingleLessonRow = async (
  lessonId: string
): Promise<LessonRow | null> => {
  const { data, error } = await supabaseAdmin
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle();
  if (error) {
    logger.error('Failed to load lesson', { lessonId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson', 500);
  }
  return (data as LessonRow | null) ?? null;
};

interface LessonMaterialJoinRowItem {
  id: string;
  title: string;
  type: string | null;
  file_url: string | null;
  file_size: number | null;
  page_count: number | null;
}

interface LessonMaterialJoinRow {
  material_id: string;
  sort_order: number;
  course_materials: LessonMaterialJoinRowItem | LessonMaterialJoinRowItem[] | null;
}

const formatBytes = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

const isMissingPageCountSelectError = (err: { message?: string; details?: string; code?: string } | null): boolean => {
  if (!err) return false;
  const text = `${err.message || ''} ${err.details || ''}`.toLowerCase();
  return text.includes('page_count') && (err.code === '42703' || text.includes('does not exist') || text.includes('could not find'));
};

const loadMaterialsByLesson = async (
  lessonIds: string[]
): Promise<Map<string, LessonMaterialJoinRow[]>> => {
  if (lessonIds.length === 0) return new Map();

  let { data, error } = await supabaseAdmin
    .from('lesson_materials')
    .select(`
      lesson_id,
      material_id,
      sort_order,
      course_materials:course_materials!inner(id, title, type, file_url, file_size, page_count)
    `)
    .in('lesson_id', lessonIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error && isMissingPageCountSelectError(error as { message?: string; details?: string; code?: string })) {
    const fallback = await supabaseAdmin
      .from('lesson_materials')
      .select(`
        lesson_id,
        material_id,
        sort_order,
        course_materials:course_materials!inner(id, title, type, file_url, file_size)
      `)
      .in('lesson_id', lessonIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    logger.error('Failed to load lesson materials', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson materials', 500);
  }
  const byLesson = new Map<string, LessonMaterialJoinRow[]>();
  for (const row of (data ?? []) as unknown as Array<LessonMaterialJoinRow & { lesson_id: string }>) {
    const list = byLesson.get(row.lesson_id) ?? [];
    list.push(row);
    byLesson.set(row.lesson_id, list);
  }
  return byLesson;
};

interface LessonAssessmentJoinRow {
  assignment_id: string;
  is_optional: boolean;
  sort_order: number;
  assignments: {
    id: string;
    title: string;
    assignment_type: string | null;
    max_points: number | null;
    due_date: string | null;
  } | { id: string; title: string; assignment_type: string | null; max_points: number | null; due_date: string | null }[] | null;
}

const loadAssessmentsByLesson = async (
  lessonIds: string[]
): Promise<Map<string, LessonAssessmentJoinRow[]>> => {
  if (lessonIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('lesson_assessments')
    .select(`
      lesson_id,
      assignment_id,
      is_optional,
      sort_order,
      assignments:assignments!inner(id, title, assignment_type, max_points, due_date)
    `)
    .in('lesson_id', lessonIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    logger.error('Failed to load lesson assessments', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson assessments', 500);
  }
  const byLesson = new Map<string, LessonAssessmentJoinRow[]>();
  for (const row of (data ?? []) as Array<LessonAssessmentJoinRow & { lesson_id: string }>) {
    const list = byLesson.get(row.lesson_id) ?? [];
    list.push(row);
    byLesson.set(row.lesson_id, list);
  }
  return byLesson;
};

interface MaterialProgressMapRow {
  material_id: string;
  progress_percent: number;
  completed: boolean;
}

const loadStudentMaterialProgress = async (
  userId: string,
  materialIds: string[]
): Promise<Map<string, MaterialProgressMapRow>> => {
  if (materialIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .select('material_id, progress_percent, completed')
    .eq('user_id', userId)
    .in('material_id', materialIds);
  if (error) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load material progress', 500);
  }
  const map = new Map<string, MaterialProgressMapRow>();
  for (const row of (data ?? []) as MaterialProgressMapRow[]) {
    map.set(row.material_id, {
      material_id: row.material_id,
      progress_percent: Number(row.progress_percent ?? 0),
      completed: Boolean(row.completed),
    });
  }
  return map;
};

interface SubmissionInfoRow {
  assignment_id: string;
  status: string | null;
  points_earned: number | null;
  max_points: number | null;
}

const loadStudentSubmissionInfo = async (
  userId: string,
  assignmentIds: string[]
): Promise<Map<string, SubmissionInfoRow>> => {
  if (assignmentIds.length === 0) return new Map();
  const { data: submissions, error: subErr } = await supabaseAdmin
    .from('submissions')
    .select('id, assignment_id, status, assignments:assignments!inner(max_points)')
    .eq('student_id', userId)
    .in('assignment_id', assignmentIds);
  if (subErr) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load submissions', 500);
  }

  const submissionIds: string[] = ((submissions ?? []) as Array<{ id: string }>).map((s) => s.id);
  const gradesByAssignment = new Map<string, number>();

  if (submissionIds.length > 0) {
    const { data: grades, error: gradeErr } = await supabaseAdmin
      .from('grades')
      .select('points_earned, submission:submissions!inner(assignment_id)')
      .in('submission_id', submissionIds);
    if (gradeErr) {
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load grades', 500);
    }
    for (const row of (grades ?? []) as Array<{ points_earned: number; submission: { assignment_id: string } | { assignment_id: string }[] }>) {
      const submission = Array.isArray(row.submission) ? row.submission[0] : row.submission;
      if (submission?.assignment_id) {
        gradesByAssignment.set(submission.assignment_id, Number(row.points_earned ?? 0));
      }
    }
  }

  const map = new Map<string, SubmissionInfoRow>();
  for (const row of (submissions ?? []) as Array<{
    assignment_id: string;
    status: string | null;
    assignments: { max_points: number | null } | { max_points: number | null }[];
  }>) {
    const assignment = Array.isArray(row.assignments) ? row.assignments[0] : row.assignments;
    const maxPoints = Number(assignment?.max_points ?? 0);
    const earned = gradesByAssignment.get(row.assignment_id);
    map.set(row.assignment_id, {
      assignment_id: row.assignment_id,
      status: row.status ?? null,
      points_earned: typeof earned === 'number' ? earned : null,
      max_points: maxPoints > 0 ? maxPoints : null,
    });
  }
  return map;
};

const loadLessonProgressMap = async (
  studentId: string,
  lessonIds: string[]
): Promise<Map<string, string>> => {
  if (lessonIds.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from('lesson_progress')
    .select('lesson_id, marked_done_at')
    .eq('student_id', studentId)
    .in('lesson_id', lessonIds);
  if (error) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson progress', 500);
  }
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ lesson_id: string; marked_done_at: string }>) {
    map.set(row.lesson_id, row.marked_done_at);
  }
  return map;
};

const loadCourseEnrollmentCount = async (courseId: string): Promise<number> => {
  const { count, error } = await supabaseAdmin
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES);
  if (error) {
    return 0;
  }
  return count ?? 0;
};

const loadLessonCompletionCounts = async (
  lessonIds: string[]
): Promise<Map<string, number>> => {
  if (lessonIds.length === 0) return new Map();
  const map = new Map<string, number>();
  for (const lessonId of lessonIds) {
    const { count, error } = await supabaseAdmin
      .from('lesson_progress')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lessonId);
    if (!error) {
      map.set(lessonId, count ?? 0);
    }
  }
  return map;
};

// ============================================
// Status / chain derivation
// ============================================

const buildCompletionRule = (row: LessonRow): LessonCompletionRule => {
  switch (row.completion_rule_type) {
    case 'view_all_files':
      return { type: 'view_all_files' };
    case 'time_on_material':
      return {
        type: 'time_on_material',
        min_minutes: row.completion_rule_min_minutes ?? 10,
      };
    case 'mark_as_done':
    default:
      return { type: 'mark_as_done' };
  }
};

const buildChain = (row: LessonRow): LessonChain => ({
  next_lesson_id: row.next_lesson_id,
  unlock_on_submit: row.unlock_on_submit,
  unlock_on_pass: row.unlock_on_pass,
  pass_threshold_percent: row.pass_threshold_percent !== null
    ? Number(row.pass_threshold_percent)
    : null,
});

interface ChainEvaluationContext {
  rowsById: Map<string, LessonRow>;
  doneByLesson: Map<string, string>;
  submissionsByAssignment: Map<string, SubmissionInfoRow>;
  assessmentsByLesson: Map<string, LessonAssessmentJoinRow[]>;
}

const isLessonChainSatisfied = (
  predecessor: LessonRow,
  ctx: ChainEvaluationContext
): { satisfied: boolean; reason?: LessonUnlockBlocker['reason'] } => {
  // The predecessor must itself be marked as done first.
  if (!ctx.doneByLesson.has(predecessor.id) && !predecessor.is_general) {
    return { satisfied: false, reason: 'predecessor_not_done' };
  }

  if (!predecessor.unlock_on_submit && !predecessor.unlock_on_pass) {
    return { satisfied: true };
  }

  const assessments = ctx.assessmentsByLesson.get(predecessor.id) ?? [];
  const required = assessments.filter((a) => !a.is_optional);

  if (required.length === 0) {
    return { satisfied: true };
  }

  if (predecessor.unlock_on_submit) {
    for (const assessment of required) {
      const sub = ctx.submissionsByAssignment.get(assessment.assignment_id);
      if (!sub || !sub.status || ['draft'].includes(sub.status)) {
        return { satisfied: false, reason: 'predecessor_assessment_pending' };
      }
    }
  }

  if (predecessor.unlock_on_pass) {
    const threshold = predecessor.pass_threshold_percent !== null
      ? Number(predecessor.pass_threshold_percent)
      : 75;
    for (const assessment of required) {
      const sub = ctx.submissionsByAssignment.get(assessment.assignment_id);
      if (!sub || sub.points_earned === null || sub.max_points === null || sub.max_points === 0) {
        return { satisfied: false, reason: 'predecessor_assessment_pending' };
      }
      const pct = (sub.points_earned / sub.max_points) * 100;
      if (pct < threshold) {
        return { satisfied: false, reason: 'predecessor_assessment_failed' };
      }
    }
  }

  return { satisfied: true };
};

const findPredecessor = (
  lesson: LessonRow,
  rows: LessonRow[]
): LessonRow | null => {
  return rows.find((other) => other.next_lesson_id === lesson.id) ?? null;
};

const deriveStudentStatus = (
  row: LessonRow,
  ctx: ChainEvaluationContext,
  rows: LessonRow[]
): { status: LessonStatus; blocker: LessonUnlockBlocker | null } => {
  if (ctx.doneByLesson.has(row.id)) {
    return { status: 'done', blocker: null };
  }
  if (row.is_general) {
    return { status: 'active', blocker: null };
  }
  const predecessor = findPredecessor(row, rows);
  if (!predecessor) {
    return { status: 'active', blocker: null };
  }
  const evaluation = isLessonChainSatisfied(predecessor, ctx);
  if (evaluation.satisfied) {
    return { status: 'active', blocker: null };
  }
  return {
    status: 'locked',
    blocker: {
      lesson_id: predecessor.id,
      lesson_title: predecessor.title,
      reason: evaluation.reason ?? 'predecessor_not_done',
    },
  };
};

// ============================================
// View assemblers
// ============================================

const toMaterialRefs = (
  rows: LessonMaterialJoinRow[] | undefined,
  progressMap: Map<string, MaterialProgressMapRow>
): LessonMaterialRef[] => {
  if (!rows) return [];
  return rows.map((row) => {
    const cm = Array.isArray(row.course_materials) ? row.course_materials[0] : row.course_materials;
    const progress = progressMap.get(row.material_id);
    return {
      material_id: row.material_id,
      title: cm?.title ?? 'Untitled material',
      file_type: cm?.type ?? 'other',
      file_size: formatBytes(cm?.file_size ?? null),
      url: cm?.file_url ?? null,
      // A material is only considered "read" once the student walks all the
      // way to the end (reader sets completed=true on reaching the last page,
      // or progress_percent rolls over to 100). Just opening it no longer
      // counts — the lesson gate downstream relies on this being a real
      // signal that the file has been browsed end-to-end.
      viewed: Boolean(progress?.completed),
      view_seconds: 0,
      page_count: cm?.page_count ?? null,
    };
  });
};

const toAssessmentRefs = (
  rows: LessonAssessmentJoinRow[] | undefined,
  submissionMap: Map<string, SubmissionInfoRow>
): LessonAssessmentRef[] => {
  if (!rows) return [];
  return rows.map((row) => {
    const a = Array.isArray(row.assignments) ? row.assignments[0] : row.assignments;
    const submission = submissionMap.get(row.assignment_id);
    const submitted = Boolean(submission && submission.status && submission.status !== 'draft');
    const graded = Boolean(submission?.points_earned !== null && submission?.points_earned !== undefined);
    const scorePercent =
      graded && submission && submission.points_earned !== null && submission.max_points !== null && submission.max_points > 0
        ? Math.round((submission.points_earned / submission.max_points) * 1000) / 10
        : null;
    return {
      assignment_id: row.assignment_id,
      title: a?.title ?? 'Assessment',
      raw_type: a?.assignment_type ?? 'activity',
      points: Number(a?.max_points ?? 0),
      is_optional: row.is_optional,
      submitted,
      graded,
      score_percent: scorePercent,
      due_date: a?.due_date ?? null,
    };
  });
};

const buildLessonView = (
  row: LessonRow,
  materialRefs: LessonMaterialRef[],
  assessmentRefs: LessonAssessmentRef[],
  status: LessonStatus,
  blocker: LessonUnlockBlocker | null,
  doneAt: string | null,
  stats?: { completed_students: number; total_students: number }
): LessonView => ({
  id: row.id,
  classId: row.course_id,
  ordering: row.sort_order,
  title: row.title,
  description: row.description,
  topics: row.topics ?? [],
  isPublished: row.is_published,
  isGeneral: row.is_general,
  createdAt: row.created_at,
  completionRule: buildCompletionRule(row),
  materials: materialRefs,
  assessments: assessmentRefs,
  chain: buildChain(row),
  status,
  unlockBlocker: blocker,
  doneAt,
  stats,
});

// ============================================
// Public reads
// ============================================

export const listForStudent = async (
  courseId: string,
  studentId: string
): Promise<LessonView[]> => {
  const rows = await loadLessonRowsForCourse(courseId, false);
  if (rows.length === 0) return [];

  const lessonIds = rows.map((r) => r.id);
  const [materialsByLesson, assessmentsByLesson, doneByLesson] = await Promise.all([
    loadMaterialsByLesson(lessonIds),
    loadAssessmentsByLesson(lessonIds),
    loadLessonProgressMap(studentId, lessonIds),
  ]);

  const allMaterialIds = new Set<string>();
  const allAssignmentIds = new Set<string>();
  for (const list of materialsByLesson.values()) {
    for (const row of list) allMaterialIds.add(row.material_id);
  }
  for (const list of assessmentsByLesson.values()) {
    for (const row of list) allAssignmentIds.add(row.assignment_id);
  }

  const [progressMap, submissionMap] = await Promise.all([
    loadStudentMaterialProgress(studentId, Array.from(allMaterialIds)),
    loadStudentSubmissionInfo(studentId, Array.from(allAssignmentIds)),
  ]);

  const rowsById = new Map(rows.map((r) => [r.id, r]));
  const ctx: ChainEvaluationContext = {
    rowsById,
    doneByLesson,
    submissionsByAssignment: submissionMap,
    assessmentsByLesson,
  };

  return rows.map((row) => {
    const materials = toMaterialRefs(materialsByLesson.get(row.id), progressMap);
    const assessments = toAssessmentRefs(assessmentsByLesson.get(row.id), submissionMap);
    const { status, blocker } = deriveStudentStatus(row, ctx, rows);
    const doneAt = doneByLesson.get(row.id) ?? null;
    return buildLessonView(row, materials, assessments, status, blocker, doneAt);
  });
};

export const getForStudent = async (
  courseId: string,
  lessonId: string,
  studentId: string
): Promise<LessonView | null> => {
  const lessons = await listForStudent(courseId, studentId);
  return lessons.find((l) => l.id === lessonId) ?? null;
};

export const listForTeacher = async (courseId: string): Promise<LessonView[]> => {
  const rows = await loadLessonRowsForCourse(courseId, true);
  if (rows.length === 0) return [];

  const lessonIds = rows.map((r) => r.id);
  const [materialsByLesson, assessmentsByLesson, completionCounts, totalStudents] = await Promise.all([
    loadMaterialsByLesson(lessonIds),
    loadAssessmentsByLesson(lessonIds),
    loadLessonCompletionCounts(lessonIds),
    loadCourseEnrollmentCount(courseId),
  ]);

  // Teacher view doesn't need student-specific submission/progress maps; pass
  // empty maps so refs come back as not-submitted/not-viewed shells.
  const emptyProgress = new Map<string, MaterialProgressMapRow>();
  const emptySubmissions = new Map<string, SubmissionInfoRow>();

  return rows.map((row) => {
    const materials = toMaterialRefs(materialsByLesson.get(row.id), emptyProgress);
    const assessments = toAssessmentRefs(assessmentsByLesson.get(row.id), emptySubmissions);
    const status: LessonStatus = row.is_published ? 'active' : 'draft';
    const stats = {
      completed_students: completionCounts.get(row.id) ?? 0,
      total_students: totalStudents,
    };
    return buildLessonView(row, materials, assessments, status, null, null, stats);
  });
};

export const getForTeacher = async (
  courseId: string,
  lessonId: string
): Promise<LessonView | null> => {
  const lessons = await listForTeacher(courseId);
  return lessons.find((l) => l.id === lessonId) ?? null;
};

// ============================================
// Mutations
// ============================================

const validateChainTarget = async (
  courseId: string,
  lessonId: string,
  nextLessonId: string | null
): Promise<void> => {
  if (nextLessonId === null) return;
  if (nextLessonId === lessonId) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'A lesson cannot chain to itself', 400);
  }
  const target = await loadSingleLessonRow(nextLessonId);
  if (!target || target.course_id !== courseId) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Chain target must be a lesson in the same course', 400);
  }
};

export const createDraft = async (courseId: string): Promise<LessonView> => {
  const { data: existing, error: countErr } = await supabaseAdmin
    .from('lessons')
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (countErr) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson order', 500);
  }
  const nextSort = existing && existing.length > 0
    ? Math.min(9998, Number((existing[0] as { sort_order: number }).sort_order ?? 0) + 1)
    : 1;

  const { data, error } = await supabaseAdmin
    .from('lessons')
    .insert({
      course_id: courseId,
      title: 'Untitled lesson',
      description: null,
      topics: [],
      sort_order: nextSort,
      is_published: false,
      is_general: false,
      completion_rule_type: 'mark_as_done',
      completion_rule_min_minutes: null,
      next_lesson_id: null,
      unlock_on_submit: true,
      unlock_on_pass: false,
      pass_threshold_percent: null,
    })
    .select('*')
    .single();
  if (error) {
    logger.error('Failed to create lesson', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create lesson', 500);
  }
  const row = data as LessonRow;
  return buildLessonView(row, [], [], 'draft', null, null, { completed_students: 0, total_students: 0 });
};

export const updateLesson = async (
  courseId: string,
  lessonId: string,
  input: UpsertLessonInput
): Promise<LessonView | null> => {
  const existing = await loadSingleLessonRow(lessonId);
  if (!existing || existing.course_id !== courseId) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }
  if (existing.is_general && input.isPublished === false) {
    // Allow editing the General lesson but never let it be unpublished.
    input.isPublished = true;
  }
  await validateChainTarget(courseId, lessonId, input.chain.next_lesson_id);

  const minMinutes =
    input.completionRule.type === 'time_on_material'
      ? Math.max(1, input.completionRule.min_minutes)
      : null;

  const { error } = await supabaseAdmin
    .from('lessons')
    .update({
      title: input.title,
      description: input.description,
      topics: input.topics,
      is_published: input.isPublished,
      completion_rule_type: input.completionRule.type,
      completion_rule_min_minutes: minMinutes,
      next_lesson_id: input.chain.next_lesson_id,
      unlock_on_submit: input.chain.unlock_on_submit,
      unlock_on_pass: input.chain.unlock_on_pass,
      pass_threshold_percent: input.chain.unlock_on_pass
        ? input.chain.pass_threshold_percent ?? 75
        : null,
    })
    .eq('id', lessonId);
  if (error) {
    logger.error('Failed to update lesson', { lessonId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update lesson', 500);
  }

  return getForTeacher(courseId, lessonId);
};

export const reorderLessons = async (
  courseId: string,
  orderedIds: string[]
): Promise<LessonView[]> => {
  // Fetch every lesson in this course up front so we can validate input.
  const rows = await loadLessonRowsForCourse(courseId, true);
  const courseLessonIds = new Set(rows.map((r) => r.id));
  for (const id of orderedIds) {
    if (!courseLessonIds.has(id)) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Reorder list contains a lesson from a different course', 400);
    }
  }

  // Apply sort order one row at a time. The General lesson stays pinned at
  // 9999 unless the teacher explicitly moves it.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i];
    const lesson = rows.find((r) => r.id === id);
    const nextOrder = lesson?.is_general ? 9999 : i + 1;
    const { error } = await supabaseAdmin
      .from('lessons')
      .update({ sort_order: nextOrder })
      .eq('id', id);
    if (error) {
      logger.error('Failed to reorder lesson', { id, error: error.message });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to reorder lessons', 500);
    }
  }

  return listForTeacher(courseId);
};

export const setChain = async (
  courseId: string,
  lessonId: string,
  chain: LessonChain
): Promise<LessonView | null> => {
  const existing = await loadSingleLessonRow(lessonId);
  if (!existing || existing.course_id !== courseId) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }
  await validateChainTarget(courseId, lessonId, chain.next_lesson_id);

  const { error } = await supabaseAdmin
    .from('lessons')
    .update({
      next_lesson_id: chain.next_lesson_id,
      unlock_on_submit: chain.unlock_on_submit,
      unlock_on_pass: chain.unlock_on_pass,
      pass_threshold_percent: chain.unlock_on_pass ? chain.pass_threshold_percent ?? 75 : null,
    })
    .eq('id', lessonId);
  if (error) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update chain', 500);
  }
  return getForTeacher(courseId, lessonId);
};

export const deleteLesson = async (
  courseId: string,
  lessonId: string
): Promise<void> => {
  const existing = await loadSingleLessonRow(lessonId);
  if (!existing || existing.course_id !== courseId) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }
  if (existing.is_general) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'The General lesson cannot be deleted; rename or split it instead',
      403
    );
  }
  const { error } = await supabaseAdmin.from('lessons').delete().eq('id', lessonId);
  if (error) {
    logger.error('Failed to delete lesson', { lessonId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete lesson', 500);
  }
};

// ============================================
// Mark as done
// ============================================

export const markLessonAsDone = async (
  courseId: string,
  lessonId: string,
  studentId: string
): Promise<LessonView | null> => {
  const existing = await loadSingleLessonRow(lessonId);
  if (!existing || existing.course_id !== courseId || !existing.is_published) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }

  // Server-side gate: a locked lesson can't be marked as done.
  const lessons = await listForStudent(courseId, studentId);
  const view = lessons.find((l) => l.id === lessonId) ?? null;
  if (!view) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }
  if (view.status === 'locked') {
    throw new ApiError(
      ErrorCode.LOCKED,
      'Finish the previous lesson before marking this one as done',
      423,
      view.unlockBlocker
    );
  }
  if (view.status === 'done') {
    return view;
  }

  if (view.completionRule.type === 'view_all_files' && view.materials.length > 0) {
    const allViewed = view.materials.every((m) => m.viewed);
    if (!allViewed) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Open every file at least once before marking the lesson as done',
        403
      );
    }
  }

  const { error } = await supabaseAdmin
    .from('lesson_progress')
    .insert({ lesson_id: lessonId, student_id: studentId, marked_done_at: new Date().toISOString() });
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      // Already marked done; idempotent.
      return getForStudent(courseId, lessonId, studentId);
    }
    logger.error('Failed to mark lesson done', { lessonId, studentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to mark lesson as done', 500);
  }

  return getForStudent(courseId, lessonId, studentId);
};

// ============================================
// Helpers exposed to other services (e.g. assignment gating override)
// ============================================

/**
 * Returns the lesson_id an assignment is bound to, or null if it isn't part
 * of any lesson. The existing assessment-gating service uses this to defer
 * to lesson done-state for lesson-bound assessments and fall back to the
 * legacy required-materials list for orphan assignments.
 */
export const findOwningLessonId = async (
  assignmentId: string
): Promise<string | null> => {
  const { data, error } = await supabaseAdmin
    .from('lesson_assessments')
    .select('lesson_id')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  if (error) return null;
  return (data as { lesson_id?: string } | null)?.lesson_id ?? null;
};

/**
 * Used by submission/exam-attempt endpoints. Returns true when the lesson
 * is either is_general or the student has marked it as done. False means
 * the assessment must stay locked.
 */
export const isStudentAllowedToSubmit = async (
  lessonId: string,
  studentId: string
): Promise<{ allowed: boolean; lesson: LessonRow | null }> => {
  const lesson = await loadSingleLessonRow(lessonId);
  if (!lesson) return { allowed: false, lesson: null };
  if (lesson.is_general) return { allowed: true, lesson };
  const { data, error } = await supabaseAdmin
    .from('lesson_progress')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) return { allowed: false, lesson };
  return { allowed: Boolean(data), lesson };
};

// ============================================
// Lesson views (per-student open tracking)
// ============================================

export interface LessonViewRow {
  lesson_id: string;
  student_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
}

export interface LessonEngagementStudent {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface LessonEngagementLesson {
  id: string;
  title: string;
  ordering: number;
  is_general: boolean;
  is_published: boolean;
}

export interface LessonEngagementCell {
  lesson_id: string;
  student_id: string;
  opened: boolean;
  done: boolean;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  marked_done_at: string | null;
}

export interface LessonEngagementMatrix {
  lessons: LessonEngagementLesson[];
  students: LessonEngagementStudent[];
  cells: LessonEngagementCell[];
}

/**
 * Records that a student opened a lesson. Idempotent: the first call inserts
 * a row, subsequent calls bump view_count and last_viewed_at. Teachers/admins
 * calling this are no-ops (we don't track teacher previews).
 */
export const trackLessonView = async (
  courseId: string,
  lessonId: string,
  userId: string
): Promise<void> => {
  const lesson = await loadSingleLessonRow(lessonId);
  if (!lesson || lesson.course_id !== courseId || !lesson.is_published) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
  }

  const { data: existing, error: selErr } = await supabaseAdmin
    .from('lesson_views')
    .select('id, view_count')
    .eq('lesson_id', lessonId)
    .eq('student_id', userId)
    .maybeSingle();

  if (selErr) {
    logger.error('Failed to read lesson_views', { lessonId, userId, error: selErr.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to track lesson view', 500);
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { error: insErr } = await supabaseAdmin
      .from('lesson_views')
      .insert({
        lesson_id: lessonId,
        student_id: userId,
        first_viewed_at: now,
        last_viewed_at: now,
        view_count: 1,
      });
    if (insErr) {
      // Race condition with another tab — treat unique violation as success.
      if ((insErr as { code?: string }).code === '23505') return;
      logger.error('Failed to insert lesson_view', { lessonId, userId, error: insErr.message });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to track lesson view', 500);
    }
    return;
  }

  const row = existing as { id: string; view_count: number };
  const { error: updErr } = await supabaseAdmin
    .from('lesson_views')
    .update({
      last_viewed_at: now,
      view_count: row.view_count + 1,
    })
    .eq('id', row.id);
  if (updErr) {
    logger.error('Failed to bump lesson_view', { lessonId, userId, error: updErr.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to track lesson view', 500);
  }
};

interface EnrolledStudentRow {
  student_id: string;
  profile: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

/**
 * Returns the per-lesson × per-student engagement matrix for a course.
 * Rows: every active enrollment. Cols: every published lesson. Cells:
 * whether the student opened (lesson_views) and/or marked the lesson done
 * (lesson_progress). Teacher/admin only — caller must have already passed
 * `assertCourseAccess(_, _, 'teacher')`.
 */
export const loadLessonEngagement = async (
  courseId: string
): Promise<LessonEngagementMatrix> => {
  const lessonRows = await loadLessonRowsForCourse(courseId, false);
  const lessons: LessonEngagementLesson[] = lessonRows.map((row, idx) => ({
    id: row.id,
    title: row.title,
    ordering: idx + 1,
    is_general: row.is_general,
    is_published: row.is_published,
  }));

  const { data: enrollData, error: enrollErr } = await supabaseAdmin
    .from('enrollments')
    .select(`
      student_id,
      profile:profiles!enrollments_student_id_fkey(id, email, first_name, last_name, avatar_url)
    `)
    .eq('course_id', courseId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES);

  if (enrollErr) {
    logger.error('Failed to load enrollments for lesson engagement', { courseId, error: enrollErr.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load enrollments', 500);
  }

  const enrollments = (enrollData ?? []) as unknown as EnrolledStudentRow[];
  const studentMap = new Map<string, LessonEngagementStudent>();
  for (const row of enrollments) {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (!profile) continue;
    studentMap.set(profile.id, {
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      avatar_url: profile.avatar_url,
    });
  }
  const students = Array.from(studentMap.values()).sort((a, b) => {
    const aName = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim().toLowerCase() || a.email.toLowerCase();
    const bName = `${b.last_name ?? ''} ${b.first_name ?? ''}`.trim().toLowerCase() || b.email.toLowerCase();
    return aName.localeCompare(bName);
  });

  const lessonIds = lessons.map((l) => l.id);
  const studentIds = students.map((s) => s.id);

  if (lessonIds.length === 0 || studentIds.length === 0) {
    return { lessons, students, cells: [] };
  }

  const [viewsRes, progressRes] = await Promise.all([
    supabaseAdmin
      .from('lesson_views')
      .select('lesson_id, student_id, first_viewed_at, last_viewed_at, view_count')
      .in('lesson_id', lessonIds)
      .in('student_id', studentIds),
    supabaseAdmin
      .from('lesson_progress')
      .select('lesson_id, student_id, marked_done_at')
      .in('lesson_id', lessonIds)
      .in('student_id', studentIds),
  ]);

  if (viewsRes.error) {
    logger.error('Failed to load lesson_views', { courseId, error: viewsRes.error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson views', 500);
  }
  if (progressRes.error) {
    logger.error('Failed to load lesson_progress', { courseId, error: progressRes.error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load lesson progress', 500);
  }

  const viewByKey = new Map<string, LessonViewRow>();
  for (const v of (viewsRes.data ?? []) as LessonViewRow[]) {
    viewByKey.set(`${v.lesson_id}:${v.student_id}`, v);
  }
  const doneByKey = new Map<string, string>();
  for (const p of (progressRes.data ?? []) as Array<{ lesson_id: string; student_id: string; marked_done_at: string }>) {
    doneByKey.set(`${p.lesson_id}:${p.student_id}`, p.marked_done_at);
  }

  const cells: LessonEngagementCell[] = [];
  for (const lesson of lessons) {
    for (const student of students) {
      const key = `${lesson.id}:${student.id}`;
      const view = viewByKey.get(key) ?? null;
      const doneAt = doneByKey.get(key) ?? null;
      cells.push({
        lesson_id: lesson.id,
        student_id: student.id,
        opened: Boolean(view) || Boolean(doneAt),
        done: Boolean(doneAt),
        first_viewed_at: view?.first_viewed_at ?? null,
        last_viewed_at: view?.last_viewed_at ?? null,
        view_count: view?.view_count ?? 0,
        marked_done_at: doneAt,
      });
    }
  }

  return { lessons, students, cells };
};
