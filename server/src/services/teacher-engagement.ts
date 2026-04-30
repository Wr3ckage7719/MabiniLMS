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
}

export interface CourseMaterialEngagementSummary {
  course_id: string;
  generated_at: string;
  materials: MaterialEngagementSummaryRow[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

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
        'material_id, user_id, progress_percent, completed, download_count, last_viewed_at'
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
  }

  const enrolledCount = enrolledStudentIds.size;

  const rows: MaterialEngagementSummaryRow[] = materials.map((m) => {
    const b = buckets.get(m.id);
    const avg = b && b.progressCount > 0 ? b.progressSum / b.progressCount : 0;
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
    };
  });

  return {
    course_id: courseId,
    generated_at: new Date().toISOString(),
    materials: rows,
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
