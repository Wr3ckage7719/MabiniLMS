/**
 * Search Routes
 *
 * API endpoints for searching across the LMS.
 */

import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { UserRole } from '../types/index.js'
import * as searchController from '../controllers/search.js'

const router = Router()

// Bound search input so unbounded ?limit= can't punish the DB and ?q can't be
// a megabyte-long string.
const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required').max(200, 'q is too long'),
  types: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
  highlight: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
})

const entitySearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required').max(200, 'q is too long'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * @swagger
 * tags:
 *   - name: Search
 *     description: Global and entity-specific search
 */

// All routes require authentication
router.use(authenticate)

// ============================================
// Global Search
// ============================================

/**
 * GET /api/search - Search across all content types
 */
router.get(
  '/',
  validate({ query: globalSearchQuerySchema }),
  searchController.globalSearch
)

// ============================================
// Entity-Specific Searches
// ============================================

/**
 * GET /api/search/courses - Search courses
 */
router.get(
  '/courses',
  validate({ query: entitySearchQuerySchema }),
  searchController.searchCourses
)

/**
 * GET /api/search/materials - Search materials
 */
router.get(
  '/materials',
  validate({ query: entitySearchQuerySchema }),
  searchController.searchMaterials
)

/**
 * GET /api/search/users - Search users (admin/teacher only)
 */
router.get(
  '/users',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  validate({ query: entitySearchQuerySchema }),
  searchController.searchUsers
)

/**
 * GET /api/search/assignments - Search assignments
 */
router.get(
  '/assignments',
  validate({ query: entitySearchQuerySchema }),
  searchController.searchAssignments
)

export default router
