import { Router } from 'express';
import * as courseController from '../controllers/courses.js';
import * as enrollmentController from '../controllers/enrollments.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { materialUpload } from '../middleware/upload.js';
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
router.patch(
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
  materialUpload.single('file'),
  validate({ params: courseMaterialsParamSchema, body: createMaterialSchema }),
  courseController.createMaterial
);

// ============================================
// Course Archive/Unarchive Routes
// ============================================

// Archive course
router.patch(
  '/:id/archive',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseIdParamSchema }),
  courseController.archiveCourse
);

// Unarchive course
router.patch(
  '/:id/unarchive',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseIdParamSchema }),
  courseController.unarchiveCourse
);

// ============================================
// Course Participants Routes
// ============================================

// Get course students (enrolled students)
router.get(
  '/:courseId/students',
  authenticate,
  validate({ params: courseMaterialsParamSchema }),
  courseController.getCourseStudents
);

// Get course teacher(s)
router.get(
  '/:courseId/teachers',
  authenticate,
  validate({ params: courseMaterialsParamSchema }),
  courseController.getCourseTeachers
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

// ============================================
// Course Insights (teacher analytics)
// ============================================

// Aggregated per-student + class-level engagement and completion metrics.
// Teacher/admin only — students don't need their peers' submission counts.
router.get(
  '/:courseId/insights',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: courseMaterialsParamSchema }),
  courseController.getCourseInsights
);

export default router;
