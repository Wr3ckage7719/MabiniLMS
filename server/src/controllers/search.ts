/**
 * Search Controller
 * 
 * HTTP handlers for search endpoints.
 */

import { Response, NextFunction } from 'express'
import { AuthRequest, UserRole } from '../types/index.js'
import * as searchService from '../services/global-search.js'

// ============================================
// Global Search
// ============================================

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search across all content types
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *           description: Comma-separated list of types (courses,materials,users,assignments)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *       - in: query
 *         name: highlight
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: Search results
 */
export const globalSearch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { q, types, limit, highlight } = req.query

    const typeArray = types
      ? (types as string).split(',').filter(Boolean) as searchService.SearchEntityType[]
      : undefined

    const results = await searchService.globalSearch(
      {
        query: q as string,
        types: typeArray,
        limit: limit ? parseInt(limit as string, 10) : 5,
        highlight: highlight === 'true',
      },
      req.user?.id,
      req.user?.role as UserRole
    )

    res.json({
      success: true,
      data: results,
    })
  } catch (error) {
    next(error)
  }
}

// ============================================
// Entity-Specific Searches
// ============================================

/**
 * @swagger
 * /api/search/courses:
 *   get:
 *     summary: Search courses
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Course search results
 */
export const searchCourses = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { q, page, limit } = req.query

    const results = await searchService.searchCourses(
      {
        query: q as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      },
      req.user?.id,
      req.user?.role as UserRole
    )

    res.json({
      success: true,
      data: results.data,
      meta: {
        total: results.total,
        page: results.page,
        limit: results.limit,
        totalPages: results.totalPages,
        hasMore: results.hasMore,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/search/materials:
 *   get:
 *     summary: Search materials
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Material search results
 */
export const searchMaterials = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { q, courseId, page, limit } = req.query

    const results = await searchService.searchMaterials(
      {
        query: q as string,
        courseId: courseId as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      },
      req.user?.id,
      req.user?.role as UserRole
    )

    res.json({
      success: true,
      data: results.data,
      meta: {
        total: results.total,
        page: results.page,
        limit: results.limit,
        totalPages: results.totalPages,
        hasMore: results.hasMore,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/search/users:
 *   get:
 *     summary: Search users (admin/teacher only)
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, teacher, student]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: User search results
 */
export const searchUsers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { q, role, page, limit } = req.query

    const results = await searchService.searchUsers(
      {
        query: q as string,
        role: role as UserRole | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      },
      req.user?.id,
      req.user?.role as UserRole
    )

    res.json({
      success: true,
      data: results.data,
      meta: {
        total: results.total,
        page: results.page,
        limit: results.limit,
        totalPages: results.totalPages,
        hasMore: results.hasMore,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @swagger
 * /api/search/assignments:
 *   get:
 *     summary: Search assignments
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Assignment search results
 */
export const searchAssignments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { q, courseId, page, limit } = req.query

    const results = await searchService.searchAssignments(
      {
        query: q as string,
        courseId: courseId as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      },
      req.user?.id,
      req.user?.role as UserRole
    )

    res.json({
      success: true,
      data: results.data,
      meta: {
        total: results.total,
        page: results.page,
        limit: results.limit,
        totalPages: results.totalPages,
        hasMore: results.hasMore,
      },
    })
  } catch (error) {
    next(error)
  }
}
