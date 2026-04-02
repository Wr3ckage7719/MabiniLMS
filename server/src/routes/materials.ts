import { Router } from 'express';
import * as courseController from '../controllers/courses.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  materialIdParamSchema,
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
