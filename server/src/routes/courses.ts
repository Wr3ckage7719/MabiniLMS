import { Router } from 'express';
import * as courseController from '../controllers/courses.js';
import * as enrollmentController from '../controllers/enrollments.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  createCourseSchema,
  updateCourseSchema,
  updateCourseStatusSchema,
  courseIdParamSchema,
  listCoursesQuerySchema,
  createMaterialSchema,
  courseMaterialsParamSchema,
} from '../types/courses.js';
import { enrollmentQuerySchema } from '../types/enrollments.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Courses
 *     description: Course management operations
 *   - name: Course Materials
 *     description: Course materials and resources
 */

// ============================================
// Course Routes
// ============================================

// List courses (all authenticated users, filtered by role)
router.get(
  '/',
  authenticate,
  validate({ query: listCoursesQuerySchema }),
  courseController.listCourses
);

// Create course (teachers and admins only)
router.post(
  '/',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ body: createCourseSchema }),
  courseController.createCourse
);

// Get course by ID
router.get(
  '/:id',
  authenticate,
  validate({ params: courseIdParamSchema }),
  courseController.getCourse
);

// Update course
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseIdParamSchema, body: updateCourseSchema }),
  courseController.updateCourse
);

// Update course status
router.patch(
  '/:id/status',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseIdParamSchema, body: updateCourseStatusSchema }),
  courseController.updateCourseStatus
);

// Delete course
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseIdParamSchema }),
  courseController.deleteCourse
);

// ============================================
// Course Materials Routes (nested under courses)
// ============================================

// List materials for a course
router.get(
  '/:courseId/materials',
  authenticate,
  validate({ params: courseMaterialsParamSchema }),
  courseController.listMaterials
);

// Create material for a course
router.post(
  '/:courseId/materials',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseMaterialsParamSchema, body: createMaterialSchema }),
  courseController.createMaterial
);

// ============================================
// Course Roster Route (for enrollments)
// ============================================

// Get course roster (enrolled students)
router.get(
  '/:courseId/roster',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ query: enrollmentQuerySchema }),
  enrollmentController.getCourseRoster
);

export default router;
