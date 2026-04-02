import { Router } from 'express';
import * as userController from '../controllers/users.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  updateProfileSchema,
  getUserByIdSchema,
  updateUserRoleSchema,
  listUsersQuerySchema,
} from '../types/auth.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User profile and management operations
 */

// Current user profile routes (any authenticated user)
router.get(
  '/me',
  authenticate,
  userController.getMyProfile
);

router.put(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  userController.updateMyProfile
);

// Admin routes - list all users
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: listUsersQuerySchema }),
  userController.listUsers
);

// Get user by ID (admin and teacher can view)
router.get(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ params: getUserByIdSchema }),
  userController.getUserById
);

// Admin-only: Update user role
router.put(
  '/:id/role',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: getUserByIdSchema, body: updateUserRoleSchema }),
  userController.updateUserRole
);

// Admin-only: Delete user
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: getUserByIdSchema }),
  userController.deleteUser
);

export default router;
