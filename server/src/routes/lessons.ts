import { Router } from 'express';
import * as lessonsController from '../controllers/lessons.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';

const router = Router();

// ===== Read endpoints =====
// Both students and teachers (of the course) can list / read lessons. The
// service layer differentiates the response (student gets locked/done state,
// teacher gets stats + draft rows).
router.get(
  '/courses/:courseId',
  authenticate,
  lessonsController.listForStudent
);

router.get(
  '/courses/:courseId/teacher',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.listForTeacher
);

router.get(
  '/courses/:courseId/lessons/:lessonId',
  authenticate,
  lessonsController.getForStudent
);

router.get(
  '/courses/:courseId/lessons/:lessonId/teacher',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.getForTeacher
);

// ===== Mutations (teacher / admin) =====
router.post(
  '/courses/:courseId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.createDraft
);

router.patch(
  '/courses/:courseId/lessons/:lessonId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.updateLesson
);

router.put(
  '/courses/:courseId/order',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.reorderLessons
);

router.patch(
  '/courses/:courseId/lessons/:lessonId/chain',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.setChain
);

router.delete(
  '/courses/:courseId/lessons/:lessonId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  lessonsController.deleteLesson
);

// ===== Student mark-as-done =====
router.post(
  '/courses/:courseId/lessons/:lessonId/mark-done',
  authenticate,
  lessonsController.markAsDone
);

export default router;
