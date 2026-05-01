import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest, ApiError, ErrorCode, UserRole } from '../types/index.js';
import { supabaseAdmin } from '../lib/supabase.js';
import * as competencyService from '../services/competency.js';
import logger from '../utils/logger.js';

// ============================================
// Authorization helpers
// ============================================

const loadCourseAccess = async (
  courseId: string
): Promise<{ teacher_id: string }> => {
  const { data, error } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
    }
    logger.error('Failed to load course for competency access check', {
      courseId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify course access', 500);
  }

  return data as { teacher_id: string };
};

const assertTeacherOwnsCourse = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;
  const course = await loadCourseAccess(courseId);
  if (course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Only the owning teacher can manage competency units',
      403
    );
  }
};

const assertTeacherOrEnrolled = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  if (userRole === UserRole.ADMIN) return;
  const course = await loadCourseAccess(courseId);
  if (course.teacher_id === userId) return;

  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', userId)
    .in('status', ['active', 'enrolled'])
    .limit(1);

  if (error) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify enrolment', 500);
  }

  if (!data || data.length === 0) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You do not have access to this course',
      403
    );
  }
};

const loadUnitWithCourse = async (
  unitId: string
): Promise<{ id: string; course_id: string }> => {
  const { data, error } = await supabaseAdmin
    .from('competency_units')
    .select('id, course_id')
    .eq('id', unitId)
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Competency unit not found', 404);
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load unit', 500);
  }

  return data as { id: string; course_id: string };
};

// ============================================
// Schemas
// ============================================

const upsertUnitSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  threshold_percent: z.number().min(0).max(100).optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

const partialUpsertUnitSchema = upsertUnitSchema.partial();

const setEvidenceSchema = z.object({
  assignment_ids: z.array(z.string().uuid()).max(50).optional(),
  material_ids: z.array(z.string().uuid()).max(50).optional(),
});

// ============================================
// Read endpoints
// ============================================

export const listUnitsForCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    await assertTeacherOrEnrolled(courseId, req.user!.id, req.user!.role);
    const units = await competencyService.listCourseCompetencyUnits(courseId);
    res.json({ success: true, data: units });
  } catch (error) {
    next(error);
  }
};

export const getMyCompetencySummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const userId = req.user!.id;
    await assertTeacherOrEnrolled(courseId, userId, req.user!.role);
    const summary = await competencyService.getStudentCourseCompetencySummary(
      courseId,
      userId
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

export const getStudentCompetencySummary = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId, studentId } = req.params;
    await assertTeacherOwnsCourse(courseId, req.user!.id, req.user!.role);
    const summary = await competencyService.getStudentCourseCompetencySummary(
      courseId,
      studentId
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};

// ============================================
// Write endpoints (teacher / admin)
// ============================================

export const createUnit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    await assertTeacherOwnsCourse(courseId, req.user!.id, req.user!.role);
    const input = upsertUnitSchema.parse(req.body);
    const unit = await competencyService.createCompetencyUnit(courseId, input);
    res.status(201).json({ success: true, data: unit });
  } catch (error) {
    next(error);
  }
};

export const updateUnit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { unitId } = req.params;
    const unit = await loadUnitWithCourse(unitId);
    await assertTeacherOwnsCourse(unit.course_id, req.user!.id, req.user!.role);
    const input = partialUpsertUnitSchema.parse(req.body);
    const updated = await competencyService.updateCompetencyUnit(unitId, input);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteUnit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { unitId } = req.params;
    const unit = await loadUnitWithCourse(unitId);
    await assertTeacherOwnsCourse(unit.course_id, req.user!.id, req.user!.role);
    await competencyService.deleteCompetencyUnit(unitId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const setEvidence = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { unitId } = req.params;
    const unit = await loadUnitWithCourse(unitId);
    await assertTeacherOwnsCourse(unit.course_id, req.user!.id, req.user!.role);
    const input = setEvidenceSchema.parse(req.body);
    const evidence = await competencyService.setUnitEvidence(unitId, input);
    res.json({ success: true, data: evidence });
  } catch (error) {
    next(error);
  }
};
