import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';
import { listRequiredMaterials, getAssessmentLockState } from './assessment-gating.js';

// ============================================
// Class-level material engagement summary
// ============================================

export interface MaterialEngagementSummaryRow {
  material_id: string;
  material_title: string;
  material_type: string | null;
  enrolled_students: number;
  students_started: number;
  students_completed: number;
  avg_progress_percent: number;
  total_downloads: number;
  last_activity_at: string | null;
  total_time_spent_seconds: number;
  avg_time_per_student_seconds: number;
}

export interface CourseMaterialEngagementSummary {
  course_id: string;
  generated_at: string;
  materials: MaterialEngagementSummaryRow[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Pulls a student's cumulative time-on-material from the JSONB
// `interaction_events` stream. The trackMaterialViewEnd flow already
// merges per-session durations into the most recent view_end event's
// `total_time_spent_seconds`, so we just need to read that. We fall back
// to summing individual `time_spent_seconds` values if the cumulative
// total isn't present (older rows).
const extractTotalTimeSpentSeconds = (events: unknown): number => {
  if (!Array.isArray(events)) return 0;
  // Most recent view_end first — server prepends events when persisting.
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const e = event as { type?: string; data?: Record<string, unknown> };
    if (e.type !== 'view_end') continue;
    const total = Number(e.data?.total_time_spent_seconds);
    if (Number.isFinite(total) && total >= 0) {
      return Math.round(total);
    }
    break;
  }
  // Fallback: sum every view_end's session time.
  let sum = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const e = event as { type?: string; data?: Record<string, unknown> };
    if (e.type !== 'view_end') continue;
    const session = Number(e.data?.time_spent_seconds);
    if (Number.isFinite(session) && session >= 0) sum += session;
  }
  return Math.round(sum);
};

export const getCourseMaterialEngagementSummary = async (
  courseId: string
): Promise<CourseMaterialEngagementSummary> => {
  const [materialsResult, enrolmentsResult, progressResult] = await Promise.all([
    supabaseAdmin
      .from('course_materials')
      .select('id, title, type')
      .eq('course_id', courseId)
      .order('uploaded_at', { ascending: true }),
    supabaseAdmin
      .from('enrollments')
      .select('student_id')
      .eq('course_id', courseId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES),
    supabaseAdmin
      .from('material_progress')
      .select(
        'material_id, user_id, progress_percent, completed, download_count, last_viewed_at, interaction_events'
      )
      .eq('course_id', courseId),
  ]);

  for (const [label, result] of [
    ['materials', materialsResult],
    ['enrolments', enrolmentsResult],
    ['progress', progressResult],
  ] as const) {
    if (result.error) {
      logger.error('Failed to load material engagement data', {
        courseId,
        label,
        error: result.error.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to compute material engagement summary',
        500
      );
    }
  }

  const materials = (materialsResult.data || []) as Array<{
    id: string;
    title: string;
    type: string | null;
  }>;

  const enrolledStudentIds = new Set<string>();
  for (const row of (enrolmentsResult.data || []) as Array<{ student_id: string | null }>) {
    if (row.student_id) enrolledStudentIds.add(row.student_id);
  }

  type Bucket = {
    starters: Set<string>;
    completers: Set<string>;
    progressSum: number;
    progressCount: number;
    downloads: number;
    lastActivityMs: number;
    totalTimeSpentSeconds: number;
    studentsWithTime: number;
  };
  const buckets = new Map<string, Bucket>();
  const ensureBucket = (id: string): Bucket => {
    let b = buckets.get(id);
    if (!b) {
      b = {
        starters: new Set(),
        completers: new Set(),
        progressSum: 0,
        progressCount: 0,
        downloads: 0,
        lastActivityMs: 0,
        totalTimeSpentSeconds: 0,
        studentsWithTime: 0,
      };
      buckets.set(id, b);
    }
    return b;
  };

  for (const row of (progressResult.data || []) as Array<{
    material_id: string;
    user_id: string;
    progress_percent: number | null;
    completed: boolean;
    download_count: number | null;
    last_viewed_at: string | null;
    interaction_events: unknown;
  }>) {
    if (!row.material_id) continue;
    if (row.user_id && !enrolledStudentIds.has(row.user_id)) continue;
    const b = ensureBucket(row.material_id);
    const percent = Number(row.progress_percent ?? 0);
    if (percent > 0 || row.completed) b.starters.add(row.user_id);
    if (row.completed) b.completers.add(row.user_id);
    b.progressSum += percent;
    b.progressCount += 1;
    b.downloads += Number(row.download_count ?? 0);
    if (row.last_viewed_at) {
      const t = new Date(row.last_viewed_at).getTime();
      if (Number.isFinite(t) && t > b.lastActivityMs) b.lastActivityMs = t;
    }
    const timeSpent = extractTotalTimeSpentSeconds(row.interaction_events);
    if (timeSpent > 0) {
      b.totalTimeSpentSeconds += timeSpent;
      b.studentsWithTime += 1;
    }
  }

  const enrolledCount = enrolledStudentIds.size;

  const rows: MaterialEngagementSummaryRow[] = materials.map((m) => {
    const b = buckets.get(m.id);
    const avg = b && b.progressCount > 0 ? b.progressSum / b.progressCount : 0;
    const totalTime = b?.totalTimeSpentSeconds ?? 0;
    // Average across students who actually engaged ("of the students who
    // opened this, they spent X on average"). Falls back to 0 when no one
    // has emitted view_end yet.
    const avgTimePerStudent =
      b && b.studentsWithTime > 0 ? totalTime / b.studentsWithTime : 0;
    return {
      material_id: m.id,
      material_title: m.title,
      material_type: m.type ?? null,
      enrolled_students: enrolledCount,
      students_started: b?.starters.size ?? 0,
      students_completed: b?.completers.size ?? 0,
      avg_progress_percent: round2(avg),
      total_downloads: b?.downloads ?? 0,
      last_activity_at:
        b && b.lastActivityMs > 0 ? new Date(b.lastActivityMs).toISOString() : null,
      total_time_spent_seconds: Math.round(totalTime),
      avg_time_per_student_seconds: Math.round(avgTimePerStudent),
    };
  });

  return {
    course_id: courseId,
    generated_at: new Date().toISOString(),
    materials: rows,
  };
};

// ============================================
// Per-material engagement detail (per-student breakdown for one material)
// ============================================

export interface MaterialStudentEngagementRow {
  student_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  started: boolean;
  completed: boolean;
  progress_percent: number;
  download_count: number;
  total_time_spent_seconds: number;
  last_viewed_at: string | null;
  completed_at: string | null;
}

export interface MaterialStudentEngagementSummary {
  course_id: string;
  material_id: string;
  material_title: string;
  material_type: string | null;
  enrolled_students: number;
  students_started: number;
  students_completed: number;
  avg_progress_percent: number;
  total_downloads: number;
  total_time_spent_seconds: number;
  avg_time_per_student_seconds: number;
  last_activity_at: string | null;
  generated_at: string;
  students: MaterialStudentEngagementRow[];
}

export const getMaterialStudentEngagement = async (
  courseId: string,
  materialId: string
): Promise<MaterialStudentEngagementSummary> => {
  const [materialResult, enrolmentsResult, progressResult] = await Promise.all([
    supabaseAdmin
      .from('course_materials')
      .select('id, title, type, course_id')
      .eq('id', materialId)
      .eq('course_id', courseId)
      .single(),
    supabaseAdmin
      .from('enrollments')
      .select(
        `student:profiles!enrollments_student_id_fkey(
          id, email, first_name, last_name, avatar_url
        )`
      )
      .eq('course_id', courseId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES),
    supabaseAdmin
      .from('material_progress')
      .select(
        'user_id, progress_percent, completed, download_count, last_viewed_at, completed_at, interaction_events'
      )
      .eq('course_id', courseId)
      .eq('material_id', materialId),
  ]);

  if (materialResult.error) {
    if ((materialResult.error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Material not found', 404);
    }
    logger.error('Failed to load material for engagement detail', {
      courseId,
      materialId,
      error: materialResult.error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load material engagement detail',
      500
    );
  }

  for (const [label, result] of [
    ['enrolments', enrolmentsResult],
    ['progress', progressResult],
  ] as const) {
    if (result.error) {
      logger.error('Failed to load material engagement detail', {
        courseId,
        materialId,
        label,
        error: result.error.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to load material engagement detail',
        500
      );
    }
  }

  const material = materialResult.data as {
    id: string;
    title: string;
    type: string | null;
  };

  type ProgressRow = {
    user_id: string;
    progress_percent: number | null;
    completed: boolean;
    download_count: number | null;
    last_viewed_at: string | null;
    completed_at: string | null;
    interaction_events: unknown;
  };
  const progressByStudent = new Map<string, ProgressRow>();
  for (const row of (progressResult.data || []) as ProgressRow[]) {
    if (row.user_id) progressByStudent.set(row.user_id, row);
  }

  const seen = new Set<string>();
  const rows: MaterialStudentEngagementRow[] = [];
  let lastActivityMs = 0;
  let progressSum = 0;
  let progressCount = 0;
  let startedCount = 0;
  let completedCount = 0;
  let downloadsTotal = 0;
  let timeTotalSeconds = 0;
  let studentsWithTime = 0;

  for (const enrolment of (enrolmentsResult.data || []) as Array<{ student?: unknown }>) {
    const s = Array.isArray(enrolment.student) ? enrolment.student[0] : enrolment.student;
    const sid = (s as { id?: string } | null | undefined)?.id;
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);

    const profile = s as {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    };
    const progress = progressByStudent.get(sid);
    const progressPercent = Number(progress?.progress_percent ?? 0);
    const started = progressPercent > 0 || Boolean(progress?.completed);
    const completed = Boolean(progress?.completed);
    const downloadCount = Number(progress?.download_count ?? 0);
    const lastViewedMs = progress?.last_viewed_at
      ? new Date(progress.last_viewed_at).getTime()
      : NaN;
    const studentTimeSpent = extractTotalTimeSpentSeconds(progress?.interaction_events);

    if (Number.isFinite(lastViewedMs) && lastViewedMs > lastActivityMs) {
      lastActivityMs = lastViewedMs;
    }
    progressSum += progressPercent;
    progressCount += 1;
    if (started) startedCount += 1;
    if (completed) completedCount += 1;
    downloadsTotal += downloadCount;
    if (studentTimeSpent > 0) {
      timeTotalSeconds += studentTimeSpent;
      studentsWithTime += 1;
    }

    rows.push({
      student_id: profile.id,
      email: profile.email,
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      avatar_url: profile.avatar_url ?? null,
      started,
      completed,
      progress_percent: round2(progressPercent),
      download_count: downloadCount,
      total_time_spent_seconds: studentTimeSpent,
      last_viewed_at: progress?.last_viewed_at ?? null,
      completed_at: progress?.completed_at ?? null,
    });
  }

  rows.sort((a, b) => {
    const an = `${a.last_name ?? ''} ${a.first_name ?? ''}`.trim();
    const bn = `${b.last_name ?? ''} ${b.first_name ?? ''}`.trim();
    return an.localeCompare(bn);
  });

  return {
    course_id: courseId,
    material_id: material.id,
    material_title: material.title,
    material_type: material.type ?? null,
    enrolled_students: rows.length,
    students_started: startedCount,
    students_completed: completedCount,
    avg_progress_percent: progressCount > 0 ? round2(progressSum / progressCount) : 0,
    total_downloads: downloadsTotal,
    total_time_spent_seconds: timeTotalSeconds,
    avg_time_per_student_seconds:
      studentsWithTime > 0 ? Math.round(timeTotalSeconds / studentsWithTime) : 0,
    last_activity_at: lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null,
    generated_at: new Date().toISOString(),
    students: rows,
  };
};

// ============================================
// Per-assessment readiness (which students can take it now)
// ============================================

export interface ReadinessStudentRow {
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  ready: boolean;
  satisfied_count: number;
  required_count: number;
  missing_material_ids: string[];
}

export interface AssessmentReadinessSummary {
  assignment_id: string;
  course_id: string;
  gating_enabled: boolean;
  required_count: number;
  ready_count: number;
  not_ready_count: number;
  students: ReadinessStudentRow[];
  generated_at: string;
}

const loadAssignmentBasics = async (
  assignmentId: string
): Promise<{ id: string; course_id: string; lm_gating_enabled: boolean }> => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('id, course_id, lm_gating_enabled')
    .eq('id', assignmentId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
    }
    logger.error('Failed to load assignment for readiness', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load assignment readiness',
      500
    );
  }

  if (!data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
  }

  return {
    id: (data as { id: string }).id,
    course_id: (data as { course_id: string }).course_id,
    lm_gating_enabled: Boolean((data as { lm_gating_enabled?: boolean }).lm_gating_enabled),
  };
};

export const getAssessmentReadiness = async (
  assignmentId: string
): Promise<AssessmentReadinessSummary> => {
  const assignment = await loadAssignmentBasics(assignmentId);
  const requirements = await listRequiredMaterials(assignmentId);

  const { data: enrolments, error: enrolErr } = await supabaseAdmin
    .from('enrollments')
    .select(
      `student:profiles!enrollments_student_id_fkey(
        id, email, first_name, last_name, avatar_url
      )`
    )
    .eq('course_id', assignment.course_id)
    .in('status', ACTIVE_ENROLLMENT_STATUSES);

  if (enrolErr) {
    logger.error('Failed to list enrolments for readiness', {
      assignmentId,
      error: enrolErr.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load enrolment list',
      500
    );
  }

  const seen = new Set<string>();
  const students: Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }> = [];
  for (const row of (enrolments || []) as Array<{ student?: unknown }>) {
    const s = Array.isArray(row.student) ? row.student[0] : row.student;
    const sid = (s as { id?: string } | null | undefined)?.id;
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    students.push({
      id: sid,
      email: (s as { email: string }).email,
      first_name: (s as { first_name?: string | null }).first_name ?? null,
      last_name: (s as { last_name?: string | null }).last_name ?? null,
      avatar_url: (s as { avatar_url?: string | null }).avatar_url ?? null,
    });
  }

  const rows: ReadinessStudentRow[] = await Promise.all(
    students.map(async (student) => {
      const state = await getAssessmentLockState(assignmentId, student.id);
      return {
        student,
        ready: !state.locked,
        satisfied_count: state.satisfied_count,
        required_count: state.required_count,
        missing_material_ids: state.missing.map((m) => m.material_id),
      } satisfies ReadinessStudentRow;
    })
  );

  rows.sort((a, b) => {
    const an = `${a.student.last_name ?? ''} ${a.student.first_name ?? ''}`.trim();
    const bn = `${b.student.last_name ?? ''} ${b.student.first_name ?? ''}`.trim();
    return an.localeCompare(bn);
  });

  return {
    assignment_id: assignmentId,
    course_id: assignment.course_id,
    gating_enabled: assignment.lm_gating_enabled,
    required_count: requirements.length,
    ready_count: rows.filter((r) => r.ready).length,
    not_ready_count: rows.filter((r) => !r.ready).length,
    students: rows,
    generated_at: new Date().toISOString(),
  };
};
