import { Router } from 'express';
import * as courseController from '../controllers/courses.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  materialIdParamSchema,
  updateMaterialProgressSchema,
  updateMaterialSchema,
} from '../types/courses.js';

const router = Router();

// ============================================
// Standalone Material Routes
// ============================================

// Get material by ID
router.get(
  '/:id',
  authenticate,
  validate({ params: materialIdParamSchema }),
  courseController.getMaterial
);

// Get current student's progress for a material
router.get(
  '/:id/progress/me',
  authenticate,
  authorize(UserRole.STUDENT),
  validate({ params: materialIdParamSchema }),
  courseController.getMyMaterialProgress
);

// Update current student's progress for a material
router.put(
  '/:id/progress/me',
  authenticate,
  authorize(UserRole.STUDENT),
  validate({ params: materialIdParamSchema, body: updateMaterialProgressSchema }),
  courseController.updateMyMaterialProgress
);

// List student progress for a material (teacher/admin)
router.get(
  '/:id/progress',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: materialIdParamSchema }),
  courseController.listMaterialProgress
);

// Update material
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: materialIdParamSchema, body: updateMaterialSchema }),
  courseController.updateMaterial
);

// Delete material
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: materialIdParamSchema }),
  courseController.deleteMaterial
);

export default router;
