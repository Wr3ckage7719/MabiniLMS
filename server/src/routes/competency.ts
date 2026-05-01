import { Router } from 'express';
import * as competencyController from '../controllers/competency.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';

const router = Router();

// Read endpoints — any authenticated student/teacher with access can hit
// these; the controller enforces enrolment / ownership.
router.get(
  '/courses/:courseId/units',
  authenticate,
  competencyController.listUnitsForCourse
);

router.get(
  '/courses/:courseId/me',
  authenticate,
  competencyController.getMyCompetencySummary
);

router.get(
  '/courses/:courseId/students/:studentId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  competencyController.getStudentCompetencySummary
);

// Mutations are teacher/admin only.
router.post(
  '/courses/:courseId/units',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  competencyController.createUnit
);

router.patch(
  '/units/:unitId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  competencyController.updateUnit
);

router.delete(
  '/units/:unitId',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  competencyController.deleteUnit
);

router.put(
  '/units/:unitId/evidence',
  authenticate,
  authorize(UserRole.TEACHER, UserRole.ADMIN),
  competencyController.setEvidence
);

export default router;
