/**
 * Search Routes
 * 
 * API endpoints for searching across the LMS.
 */

import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { UserRole } from '../types/index.js'
import * as searchController from '../controllers/search.js'

const router = Router()

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
router.get('/', searchController.globalSearch)

// ============================================
// Entity-Specific Searches
// ============================================

/**
 * GET /api/search/courses - Search courses
 */
router.get('/courses', searchController.searchCourses)

/**
 * GET /api/search/materials - Search materials
 */
router.get('/materials', searchController.searchMaterials)

/**
 * GET /api/search/users - Search users (admin/teacher only)
 */
router.get(
  '/users',
  authorize(UserRole.ADMIN, UserRole.TEACHER),
  searchController.searchUsers
)

/**
 * GET /api/search/assignments - Search assignments
 */
router.get('/assignments', searchController.searchAssignments)

export default router
