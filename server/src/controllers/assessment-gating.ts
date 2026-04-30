import { Response, NextFunction } from 'express';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import * as gatingService from '../services/assessment-gating.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js';

/**
 * Authorize teacher/admin write access for required-materials mutations.
 * Students can read the lock state for themselves but never the global
 * required-materials list.
 */
const assertTeacherOwnsAssignment = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('id, course:courses!inner(id, teacher_id)')
    .eq('id', assignmentId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
    }
    logger.error('Failed to verify assignment ownership for gating', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify assignment ownership',
      500
    );
  }

  const courseRaw = (data as unknown as { course?: unknown }).course;
  const course = Array.isArray(courseRaw)
    ? (courseRaw[0] as { teacher_id: string | null } | undefined)
    : (courseRaw as { teacher_id: string | null } | undefined);

  if (!course || course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only the owning teacher can manage required materials',
      403
    );
  }
};

const assertEnrolledOrTeacher = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select('id, course:courses!inner(id, teacher_id)')
    .eq('id', assignmentId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
    }
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify assignment access',
      500
    );
  }

  const courseRaw = (data as unknown as { course?: unknown }).course;
  const course = Array.isArray(courseRaw)
    ? (courseRaw[0] as { id: string; teacher_id: string | null } | undefined)
    : (courseRaw as { id: string; teacher_id: string | null } | undefined);

  if (!course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
  }

  if (course.teacher_id === userId) return;

  const { data: enrolment, error: enrolmentErr } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', course.id)
    .eq('student_id', userId)
    .in('status', ['active', 'enrolled'])
    .limit(1);

  if (enrolmentErr) {
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify enrolment for assignment',
      500
    );
  }

  if (!enrolment || enrolment.length === 0) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You do not have access to this assignment',
      403
    );
  }
};

// ============================================
// Read endpoints
// ============================================

export const listRequiredMaterials = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    await assertEnrolledOrTeacher(id, req.user!.id, req.user!.role);

    const [materials, gatingFlagRow] = await Promise.all([
      gatingService.listRequiredMaterials(id),
      supabaseAdmin
        .from('assignments')
        .select('lm_gating_enabled')
        .eq('id', id)
        .single(),
    ]);

    const gating_enabled = Boolean(
      (gatingFlagRow.data as { lm_gating_enabled?: boolean } | null)?.lm_gating_enabled
    );

    res.json({
      success: true,
      data: {
        gating_enabled,
        materials,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyLockState = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    await assertEnrolledOrTeacher(id, userId, req.user!.role);
    const state = await gatingService.getAssessmentLockState(id, userId);
    res.json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
};

// ============================================
// Write endpoints (teacher/admin)
// ============================================

export const setRequiredMaterials = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    await assertTeacherOwnsAssignment(id, req.user!.id, req.user!.role);

    const body = req.body as {
      enabled?: boolean;
      materials: Array<{ material_id: string; min_progress_percent?: number }>;
    };

    const materials = await gatingService.setRequiredMaterials(id, body.materials);

    let gating_enabled: boolean;
    if (typeof body.enabled === 'boolean') {
      gating_enabled = await gatingService.setLmGatingEnabled(id, body.enabled);
    } else {
      const { data } = await supabaseAdmin
        .from('assignments')
        .select('lm_gating_enabled')
        .eq('id', id)
        .single();
      gating_enabled = Boolean(
        (data as { lm_gating_enabled?: boolean } | null)?.lm_gating_enabled
      );
    }

    res.json({
      success: true,
      data: { gating_enabled, materials },
    });
  } catch (error) {
    next(error);
  }
};
