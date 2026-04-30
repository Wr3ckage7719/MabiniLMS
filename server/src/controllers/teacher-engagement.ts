import { Response, NextFunction } from 'express';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import * as engagementService from '../services/teacher-engagement.js';
import { supabaseAdmin } from '../lib/supabase.js';
import logger from '../utils/logger.js';

const assertCanReadCourse = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;
  if (userRole !== UserRole.TEACHER) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Engagement analytics are only available to teachers and admins',
      403
    );
  }

  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
    }
    logger.error('Failed to verify course ownership for engagement read', {
      courseId,
      error: error.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to verify course ownership',
      500
    );
  }

  if (!data || (data as { teacher_id: string }).teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You do not own this course',
      403
    );
  }
};

const assertCanReadAssignment = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;
  if (userRole !== UserRole.TEACHER) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Readiness data is only available to teachers and admins',
      403
    );
  }

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
    ? (courseRaw[0] as { teacher_id: string | null } | undefined)
    : (courseRaw as { teacher_id: string | null } | undefined);

  if (!course || course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You do not own this assessment',
      403
    );
  }
};

export const getCourseMaterialEngagementSummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    await assertCanReadCourse(courseId, req.user!.id, req.user!.role);
    const data = await engagementService.getCourseMaterialEngagementSummary(courseId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getAssessmentReadiness = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    await assertCanReadAssignment(id, req.user!.id, req.user!.role);
    const data = await engagementService.getAssessmentReadiness(id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
