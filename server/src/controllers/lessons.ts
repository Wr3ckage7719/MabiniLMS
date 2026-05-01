import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest, ApiError, ErrorCode } from '../types/index.js';
import * as lessonsService from '../services/lessons.js';
import * as websocket from '../services/websocket.js';

// ============================================
// Schemas
// ============================================

const completionRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mark_as_done') }),
  z.object({ type: z.literal('view_all_files') }),
  z.object({ type: z.literal('time_on_material'), min_minutes: z.number().int().min(1).max(240) }),
]);

const chainSchema = z.object({
  next_lesson_id: z.string().uuid().nullable(),
  unlock_on_submit: z.boolean(),
  unlock_on_pass: z.boolean(),
  pass_threshold_percent: z.number().min(0).max(100).nullable(),
});

const upsertLessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional().default(null),
  topics: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  isPublished: z.boolean(),
  completionRule: completionRuleSchema,
  chain: chainSchema,
});

const reorderSchema = z.object({
  lesson_ids: z.array(z.string().uuid()).min(1).max(200),
});

const setChainSchema = chainSchema;

// ============================================
// Read endpoints
// ============================================

export const listForStudent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId } = req.params;
    const { isTeacher } = await lessonsService.assertCourseAccess(
      courseId,
      req.user!.id,
      'student_or_teacher'
    );
    const lessons = isTeacher
      ? await lessonsService.listForTeacher(courseId)
      : await lessonsService.listForStudent(courseId, req.user!.id);
    res.json({ success: true, data: lessons });
  } catch (error) {
    next(error);
  }
};

export const getForStudent = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    const { isTeacher } = await lessonsService.assertCourseAccess(
      courseId,
      req.user!.id,
      'student_or_teacher'
    );
    const lesson = isTeacher
      ? await lessonsService.getForTeacher(courseId, lessonId)
      : await lessonsService.getForStudent(courseId, lessonId, req.user!.id);
    if (!lesson) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
    }
    res.json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};

export const listForTeacher = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const lessons = await lessonsService.listForTeacher(courseId);
    res.json({ success: true, data: lessons });
  } catch (error) {
    next(error);
  }
};

export const getForTeacher = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const lesson = await lessonsService.getForTeacher(courseId, lessonId);
    if (!lesson) {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Lesson not found', 404);
    }
    res.json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};

// ============================================
// Mutations
// ============================================

export const createDraft = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const lesson = await lessonsService.createDraft(courseId);
    websocket.notifyLessonCreated(courseId, lesson);
    res.status(201).json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};

export const updateLesson = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const input = upsertLessonSchema.parse(req.body);
    const lesson = await lessonsService.updateLesson(courseId, lessonId, {
      title: input.title,
      description: input.description ?? null,
      topics: input.topics,
      isPublished: input.isPublished,
      completionRule: input.completionRule,
      chain: input.chain,
    });
    if (lesson) {
      websocket.notifyLessonUpdated(courseId, lesson);
    }
    res.json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};

export const reorderLessons = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const input = reorderSchema.parse(req.body);
    const lessons = await lessonsService.reorderLessons(courseId, input.lesson_ids);
    websocket.notifyLessonReordered(courseId);
    res.json({ success: true, data: lessons });
  } catch (error) {
    next(error);
  }
};

export const setChain = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    const input = setChainSchema.parse(req.body);
    const lesson = await lessonsService.setChain(courseId, lessonId, input);
    if (lesson) {
      websocket.notifyLessonUpdated(courseId, lesson);
    }
    res.json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};

export const deleteLesson = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'teacher');
    await lessonsService.deleteLesson(courseId, lessonId);
    websocket.notifyLessonDeleted(courseId, lessonId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const markAsDone = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { courseId, lessonId } = req.params;
    await lessonsService.assertCourseAccess(courseId, req.user!.id, 'student');
    const lesson = await lessonsService.markLessonAsDone(courseId, lessonId, req.user!.id);
    if (lesson) {
      websocket.notifyLessonMarkedDone(courseId, lessonId, req.user!.id);
    }
    res.json({ success: true, data: lesson });
  } catch (error) {
    next(error);
  }
};
