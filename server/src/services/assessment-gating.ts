import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';
import { findOwningLessonId, isStudentAllowedToSubmit } from './lessons.js';

// ============================================
// Types
// ============================================

export interface RequiredMaterialRow {
  id: string;
  assignment_id: string;
  material_id: string;
  min_progress_percent: number;
  created_at: string;
}

export interface RequiredMaterialWithMeta extends RequiredMaterialRow {
  material: {
    id: string;
    title: string;
    type: string | null;
  };
}

export interface MissingRequirement {
  required_id: string;
  material_id: string;
  material_title: string;
  min_progress_percent: number;
  current_progress_percent: number;
  completed: boolean;
}

export interface AssessmentLockState {
  gating_enabled: boolean;
  required_count: number;
  satisfied_count: number;
  locked: boolean;
  missing: MissingRequirement[];
}

// ============================================
// Loaders
// ============================================

const loadAssignmentGatingFlag = async (
  assignmentId: string
): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('lm_gating_enabled')
    .eq('id', assignmentId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
    }
    logger.error('Failed to load assignment gating flag', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load assessment gating state',
      500
    );
  }

  return Boolean((data as { lm_gating_enabled?: boolean } | null)?.lm_gating_enabled);
};

export const listRequiredMaterials = async (
  assignmentId: string
): Promise<RequiredMaterialWithMeta[]> => {
  const { data, error } = await supabaseAdmin
    .from('assessment_required_materials')
    .select(
      `id, assignment_id, material_id, min_progress_percent, created_at,
       material:course_materials!inner(id, title, type)`
    )
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to list required materials', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load required materials',
      500
    );
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const material = Array.isArray(row.material) ? row.material[0] : row.material;
    return {
      id: row.id as string,
      assignment_id: row.assignment_id as string,
      material_id: row.material_id as string,
      min_progress_percent: Number(row.min_progress_percent ?? 100),
      created_at: row.created_at as string,
      material: {
        id: (material as { id: string })?.id ?? (row.material_id as string),
        title: (material as { title?: string })?.title ?? 'Untitled material',
        type: (material as { type?: string | null })?.type ?? null,
      },
    } satisfies RequiredMaterialWithMeta;
  });
};

interface ProgressRow {
  material_id: string;
  progress_percent: number;
  completed: boolean;
}

const loadStudentProgressForMaterials = async (
  userId: string,
  materialIds: string[]
): Promise<Map<string, ProgressRow>> => {
  if (materialIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .select('material_id, progress_percent, completed')
    .eq('user_id', userId)
    .in('material_id', materialIds);

  if (error) {
    logger.error('Failed to load student material progress', {
      userId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to load student progress',
      500
    );
  }

  const map = new Map<string, ProgressRow>();
  for (const row of (data || []) as ProgressRow[]) {
    map.set(row.material_id, {
      material_id: row.material_id,
      progress_percent: Number(row.progress_percent ?? 0),
      completed: Boolean(row.completed),
    });
  }
  return map;
};

// ============================================
// Public API
// ============================================

/**
 * Compute whether a student is allowed to start/submit an assessment based
 * on the configured required-materials gate. Returns the full state so the
 * client can render which materials are still missing.
 */
export const getAssessmentLockState = async (
  assignmentId: string,
  userId: string
): Promise<AssessmentLockState> => {
  const gatingEnabled = await loadAssignmentGatingFlag(assignmentId);
  const requirements = await listRequiredMaterials(assignmentId);

  if (requirements.length === 0 || !gatingEnabled) {
    return {
      gating_enabled: gatingEnabled,
      required_count: requirements.length,
      satisfied_count: requirements.length,
      locked: false,
      missing: [],
    };
  }

  const progressMap = await loadStudentProgressForMaterials(
    userId,
    requirements.map((r) => r.material_id)
  );

  const missing: MissingRequirement[] = [];
  let satisfied = 0;

  for (const req of requirements) {
    const progress = progressMap.get(req.material_id);
    const currentPercent = progress?.progress_percent ?? 0;
    const completed = progress?.completed ?? false;
    const meets = completed || currentPercent >= req.min_progress_percent;

    if (meets) {
      satisfied += 1;
    } else {
      missing.push({
        required_id: req.id,
        material_id: req.material_id,
        material_title: req.material.title,
        min_progress_percent: req.min_progress_percent,
        current_progress_percent: currentPercent,
        completed,
      });
    }
  }

  return {
    gating_enabled: true,
    required_count: requirements.length,
    satisfied_count: satisfied,
    locked: missing.length > 0,
    missing,
  };
};

/**
 * Throws a 423 Locked ApiError if the student has not met the required-LM
 * threshold for this assessment. Pass through silently when the gate is
 * disabled or no requirements are configured.
 *
 * Lesson-aware: if the assignment is bound to a non-general lesson, the
 * lesson's done-state is the gate. The legacy required-materials list only
 * applies to assignments that aren't part of the lesson model (orphan or
 * legacy data) — after the 038 backfill that's effectively no-one, but the
 * fallback is preserved so old courses keep working.
 */
export const assertAssessmentUnlocked = async (
  assignmentId: string,
  userId: string
): Promise<void> => {
  const lessonId = await findOwningLessonId(assignmentId);
  if (lessonId) {
    const { allowed, lesson } = await isStudentAllowedToSubmit(lessonId, userId);
    if (!allowed) {
      throw new ApiError(
        ErrorCode.LOCKED,
        'Mark this lesson as done before starting the assessment.',
        423,
        {
          reason: 'lesson_gating',
          lesson_id: lessonId,
          lesson_title: lesson?.title ?? null,
        }
      );
    }
    // Lesson-bound and lesson is done (or general). Skip the legacy gate —
    // the lesson model is the source of truth here.
    return;
  }

  const state = await getAssessmentLockState(assignmentId, userId);
  if (!state.locked) return;

  throw new ApiError(
    ErrorCode.LOCKED,
    'Complete the required learning materials before working on this assessment.',
    423,
    {
      reason: 'lm_gating',
      missing: state.missing,
      required_count: state.required_count,
      satisfied_count: state.satisfied_count,
    }
  );
};

// ============================================
// Mutations (teacher CRUD)
// ============================================

export interface RequiredMaterialInput {
  material_id: string;
  min_progress_percent?: number;
}

const verifyMaterialsBelongToAssignmentCourse = async (
  assignmentId: string,
  materialIds: string[]
): Promise<void> => {
  if (materialIds.length === 0) return;

  const { data: assignmentRow, error: assignmentErr } = await supabaseAdmin
    .from('assignments')
    .select('course_id')
    .eq('id', assignmentId)
    .single();

  if (assignmentErr || !assignmentRow) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
  }

  const courseId = (assignmentRow as { course_id: string }).course_id;

  const { data: materialRows, error: materialErr } = await supabaseAdmin
    .from('course_materials')
    .select('id, course_id')
    .in('id', materialIds);

  if (materialErr) {
    logger.error('Failed to verify required materials', {
      assignmentId,
      error: materialErr.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify required materials',
      500
    );
  }

  const found = new Set(((materialRows || []) as Array<{ id: string; course_id: string }>).map((m) => m.id));
  const missing = materialIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'One or more required materials do not exist',
      400,
      { missing_material_ids: missing }
    );
  }

  const wrongCourse = ((materialRows || []) as Array<{ id: string; course_id: string }>).filter(
    (m) => m.course_id !== courseId
  );
  if (wrongCourse.length > 0) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Required materials must belong to the same course as the assessment',
      400,
      { wrong_course_material_ids: wrongCourse.map((m) => m.id) }
    );
  }
};

/**
 * Replace the full set of required materials for an assignment. Performed
 * as delete-then-insert so the teacher always gets the exact list they sent.
 */
export const setRequiredMaterials = async (
  assignmentId: string,
  inputs: RequiredMaterialInput[]
): Promise<RequiredMaterialWithMeta[]> => {
  const seen = new Set<string>();
  for (const item of inputs) {
    if (seen.has(item.material_id)) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Duplicate required material in request',
        400,
        { duplicate_material_id: item.material_id }
      );
    }
    seen.add(item.material_id);
  }

  await verifyMaterialsBelongToAssignmentCourse(
    assignmentId,
    inputs.map((i) => i.material_id)
  );

  const { error: deleteErr } = await supabaseAdmin
    .from('assessment_required_materials')
    .delete()
    .eq('assignment_id', assignmentId);

  if (deleteErr) {
    logger.error('Failed to clear required materials', {
      assignmentId,
      error: deleteErr.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update required materials',
      500
    );
  }

  if (inputs.length > 0) {
    const rows = inputs.map((i) => ({
      assignment_id: assignmentId,
      material_id: i.material_id,
      min_progress_percent:
        typeof i.min_progress_percent === 'number' ? i.min_progress_percent : 100,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from('assessment_required_materials')
      .insert(rows);

    if (insertErr) {
      logger.error('Failed to insert required materials', {
        assignmentId,
        error: insertErr.message,
      });
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Failed to update required materials',
        500
      );
    }
  }

  return listRequiredMaterials(assignmentId);
};

export const setLmGatingEnabled = async (
  assignmentId: string,
  enabled: boolean
): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .update({ lm_gating_enabled: enabled })
    .eq('id', assignmentId)
    .select('lm_gating_enabled')
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
    }
    logger.error('Failed to update gating flag', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to update gating flag',
      500
    );
  }

  return Boolean((data as { lm_gating_enabled?: boolean } | null)?.lm_gating_enabled);
};
