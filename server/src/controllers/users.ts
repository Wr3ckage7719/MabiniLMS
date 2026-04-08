import { Response, NextFunction } from 'express';
import { AuthRequest, ApiResponse, ApiError, ErrorCode } from '../types/index.js';
import {
  UpdateProfileInput,
  UpdateUserRoleInput,
  ListUsersQuery,
  UserProfile,
  PaginatedUsers,
} from '../types/auth.js';
import * as userService from '../services/users.js';

// Type for request with file from multer
interface AuthRequestWithFile extends AuthRequest {
  file?: Express.Multer.File;
}

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     description: Get the authenticated user's profile
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const getMyProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const profile = await userService.getUserById(userId);

    const response: ApiResponse<UserProfile> = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users/me:
 *   put:
 *     summary: Update current user profile
 *     description: Update the authenticated user's profile
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const updateMyProfile = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const input: UpdateProfileInput = req.body;
    const profile = await userService.updateProfile(userId, input);

    const response: ApiResponse<UserProfile> = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List all users (Admin only)
 *     description: Get paginated list of all users with optional filtering
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *       - name: role
 *         in: query
 *         schema:
 *           type: string
 *           enum: [admin, teacher, student]
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of users
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
export const listUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const query: ListUsersQuery = req.query as any;
    const result = await userService.listUsers(query);

    const response: ApiResponse<PaginatedUsers> = {
      success: true,
      data: result,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID (Admin/Teacher)
 *     description: Get a specific user's profile by their ID
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const getUserById = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const profile = await userService.getUserById(id);

    const response: ApiResponse<UserProfile> = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users/{id}/role:
 *   put:
 *     summary: Update user role (Admin only)
 *     description: Change a user's role (admin, teacher, student)
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, teacher, student]
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const updateUserRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const input: UpdateUserRoleInput = req.body;
    const currentUserId = req.user!.id;

    // Prevent admins from changing their own role
    if (id === currentUserId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'You cannot change your own role',
        403
      );
    }

    const profile = await userService.updateUserRole(id, input);

    const response: ApiResponse<UserProfile> = {
      success: true,
      data: profile,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user (Admin only)
 *     description: Permanently delete a user account
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
export const deleteUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user!.id;

    // Prevent admins from deleting themselves
    if (id === currentUserId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'You cannot delete your own account',
        403
      );
    }

    await userService.deleteUser(id);

    const response: ApiResponse = {
      success: true,
      data: { message: 'User deleted successfully' },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/users/me/avatar:
 *   post:
 *     summary: Upload user avatar
 *     description: Upload a new avatar image for the authenticated user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - avatar
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Avatar image file (JPEG, PNG, GIF, or WebP, max 5MB)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatar_url:
 *                       type: string
 *                       format: uri
 *       400:
 *         description: Invalid file type or size
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
export const uploadAvatar = async (
  req: AuthRequestWithFile,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'No avatar file provided',
        400
      );
    }

    const avatarUrl = await userService.uploadAvatar(userId, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });

    const response: ApiResponse<{ avatar_url: string }> = {
      success: true,
      data: { avatar_url: avatarUrl },
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
};
