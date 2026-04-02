import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  enrollInCourseSchema,
  updateEnrollmentStatusSchema,
  enrollmentQuerySchema,
} from '../types/enrollments.js';
import * as enrollmentController from '../controllers/enrollments.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Enrollments
 *   description: Course enrollment management
 */

// All routes require authentication
router.use(authenticate);

// POST /api/enrollments - Enroll in a course (students only)
router.post(
  '/',
  authorize(UserRole.STUDENT),
  validate({ body: enrollInCourseSchema }),
  enrollmentController.enroll
);

// GET /api/enrollments/my-courses - Get student's enrolled courses
router.get(
  '/my-courses',
  authorize(UserRole.STUDENT),
  validate({ query: enrollmentQuerySchema }),
  enrollmentController.getMyCourses
);

// GET /api/enrollments/:id - Get enrollment by ID
router.get(
  '/:id',
  enrollmentController.getEnrollment
);

// PATCH /api/enrollments/:id/status - Update enrollment status
router.patch(
  '/:id/status',
  validate({ body: updateEnrollmentStatusSchema }),
  enrollmentController.updateStatus
);

// DELETE /api/enrollments/:id - Unenroll from course
router.delete(
  '/:id',
  enrollmentController.unenroll
);

export default router;
