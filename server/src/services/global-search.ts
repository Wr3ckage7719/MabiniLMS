/**
 * Global Search Service
 * 
 * Unified search across courses, materials, users, and assignments.
 */

import { supabaseAdmin } from '../lib/supabase.js'
import { UserRole } from '../types/index.js'
import {
  applySearch,
  SearchParams,
  extractSnippet,
  highlightSearchTerms,
  isValidSearchQuery,
} from './search.js'
import { applyPagination, PaginatedResult } from './pagination.js'
import logger from '../utils/logger.js'

// ============================================
// Types
// ============================================

export interface GlobalSearchParams {
  query: string
  types?: SearchEntityType[]
  limit?: number
  highlight?: boolean
}

export type SearchEntityType = 'courses' | 'materials' | 'users' | 'assignments'

export interface SearchHit {
  id: string
  type: SearchEntityType
  title: string
  description?: string | null
  snippet?: string
  url?: string
  metadata?: Record<string, any>
  score?: number
}

export interface GlobalSearchResult {
  query: string
  total: number
  results: SearchHit[]
  facets: {
    courses: number
    materials: number
    users: number
    assignments: number
  }
}

// ============================================
// Course Search
// ============================================

/**
 * Search courses by title and description
 */
export const searchCourses = async (
  params: SearchParams & { page?: number; limit?: number },
  _userId?: string,
  userRole?: UserRole
): Promise<PaginatedResult<SearchHit>> => {
  const { query, page = 1, limit = 20 } = params

  if (!isValidSearchQuery(query)) {
    return { data: [], total: 0, page, limit, totalPages: 0, hasMore: false }
  }

  let dbQuery = supabaseAdmin
    .from('courses')
    .select('id, title, description, teacher_id, status, created_at', { count: 'exact' })

  // Apply search across title and description
  dbQuery = applySearch(dbQuery, {
    query,
    columns: ['title', 'description'],
    mode: 'contains',
  })

  // Filter by visibility based on user role
  if (userRole !== UserRole.ADMIN) {
    dbQuery = dbQuery.eq('status', 'published')
  }

  // Apply pagination
  dbQuery = applyPagination(dbQuery, page, limit)

  const { data, error, count } = await dbQuery

  if (error) {
    logger.error('Course search failed', { error: error.message, query })
    throw error
  }

  const total = count || 0
  const results: SearchHit[] = (data || []).map((course: any) => ({
    id: course.id,
    type: 'courses' as SearchEntityType,
    title: course.title,
    description: course.description,
    snippet: course.description ? extractSnippet(course.description, query, 100) : undefined,
    url: `/courses/${course.id}`,
    metadata: {
      status: course.status,
      teacher_id: course.teacher_id,
      created_at: course.created_at,
    },
  }))

  return {
    data: results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  }
}

// ============================================
// Material Search
// ============================================

/**
 * Search materials by title and description
 */
export const searchMaterials = async (
  params: SearchParams & { page?: number; limit?: number; courseId?: string },
  _userId?: string,
  userRole?: UserRole
): Promise<PaginatedResult<SearchHit>> => {
  const { query, page = 1, limit = 20, courseId } = params

  if (!isValidSearchQuery(query)) {
    return { data: [], total: 0, page, limit, totalPages: 0, hasMore: false }
  }

  let dbQuery = supabaseAdmin
    .from('materials')
    .select(`
      id, 
      title, 
      description, 
      type, 
      course_id, 
      created_at,
      course:courses!inner(id, title, status)
    `, { count: 'exact' })

  // Apply search
  dbQuery = applySearch(dbQuery, {
    query,
    columns: ['title', 'description'],
    mode: 'contains',
  })

  // Filter by course if specified
  if (courseId) {
    dbQuery = dbQuery.eq('course_id', courseId)
  }

  // Filter by published courses for non-admins
  if (userRole !== UserRole.ADMIN) {
    dbQuery = dbQuery.eq('course.status', 'published')
  }

  // Apply pagination
  dbQuery = applyPagination(dbQuery, page, limit)

  const { data, error, count } = await dbQuery

  if (error) {
    logger.error('Material search failed', { error: error.message, query })
    throw error
  }

  const total = count || 0
  const results: SearchHit[] = (data || []).map((material: any) => {
    const course = Array.isArray(material.course) ? material.course[0] : material.course
    return {
      id: material.id,
      type: 'materials' as SearchEntityType,
      title: material.title,
      description: material.description,
      snippet: material.description ? extractSnippet(material.description, query, 100) : undefined,
      url: `/courses/${material.course_id}/materials/${material.id}`,
      metadata: {
        type: material.type,
        course_id: material.course_id,
        course_title: course?.title,
        created_at: material.created_at,
      },
    }
  })

  return {
    data: results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  }
}

// ============================================
// User Search (Admin/Teacher only)
// ============================================

/**
 * Search users by name and email
 */
export const searchUsers = async (
  params: SearchParams & { page?: number; limit?: number; role?: UserRole },
  _userId?: string,
  userRole?: UserRole
): Promise<PaginatedResult<SearchHit>> => {
  const { query, page = 1, limit = 20, role } = params

  if (!isValidSearchQuery(query)) {
    return { data: [], total: 0, page, limit, totalPages: 0, hasMore: false }
  }

  // Only admins and teachers can search users
  if (userRole !== UserRole.ADMIN && userRole !== UserRole.TEACHER) {
    return { data: [], total: 0, page, limit, totalPages: 0, hasMore: false }
  }

  let dbQuery = supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, role, avatar_url, created_at', { count: 'exact' })

  // Apply search across name and email
  dbQuery = applySearch(dbQuery, {
    query,
    columns: ['first_name', 'last_name', 'email'],
    mode: 'contains',
  })

  // Filter by role if specified
  if (role) {
    dbQuery = dbQuery.eq('role', role)
  }

  // Teachers can only see students
  if (userRole === UserRole.TEACHER) {
    dbQuery = dbQuery.eq('role', UserRole.STUDENT)
  }

  // Apply pagination
  dbQuery = applyPagination(dbQuery, page, limit)

  const { data, error, count } = await dbQuery

  if (error) {
    logger.error('User search failed', { error: error.message, query })
    throw error
  }

  const total = count || 0
  const results: SearchHit[] = (data || []).map((user: any) => ({
    id: user.id,
    type: 'users' as SearchEntityType,
    title: `${user.first_name} ${user.last_name}`.trim() || user.email,
    description: user.email,
    url: `/users/${user.id}`,
    metadata: {
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    },
  }))

  return {
    data: results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  }
}

// ============================================
// Assignment Search
// ============================================

/**
 * Search assignments by title and instructions
 */
export const searchAssignments = async (
  params: SearchParams & { page?: number; limit?: number; courseId?: string },
  _userId?: string,
  userRole?: UserRole
): Promise<PaginatedResult<SearchHit>> => {
  const { query, page = 1, limit = 20, courseId } = params

  if (!isValidSearchQuery(query)) {
    return { data: [], total: 0, page, limit, totalPages: 0, hasMore: false }
  }

  let dbQuery = supabaseAdmin
    .from('assignments')
    .select(`
      id, 
      title, 
      instructions, 
      due_date, 
      max_points, 
      course_id, 
      created_at,
      course:courses!inner(id, title, status)
    `, { count: 'exact' })

  // Apply search
  dbQuery = applySearch(dbQuery, {
    query,
    columns: ['title', 'instructions'],
    mode: 'contains',
  })

  // Filter by course if specified
  if (courseId) {
    dbQuery = dbQuery.eq('course_id', courseId)
  }

  // Filter by published courses for non-admins
  if (userRole !== UserRole.ADMIN) {
    dbQuery = dbQuery.eq('course.status', 'published')
  }

  // Apply pagination
  dbQuery = applyPagination(dbQuery, page, limit)

  const { data, error, count } = await dbQuery

  if (error) {
    logger.error('Assignment search failed', { error: error.message, query })
    throw error
  }

  const total = count || 0
  const results: SearchHit[] = (data || []).map((assignment: any) => {
    const course = Array.isArray(assignment.course) ? assignment.course[0] : assignment.course
    return {
      id: assignment.id,
      type: 'assignments' as SearchEntityType,
      title: assignment.title,
      description: assignment.instructions,
      snippet: assignment.instructions ? extractSnippet(assignment.instructions, query, 100) : undefined,
      url: `/courses/${assignment.course_id}/assignments/${assignment.id}`,
      metadata: {
        due_date: assignment.due_date,
        max_points: assignment.max_points,
        course_id: assignment.course_id,
        course_title: course?.title,
        created_at: assignment.created_at,
      },
    }
  })

  return {
    data: results,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  }
}

// ============================================
// Global Search
// ============================================

/**
 * Search across all entity types
 */
export const globalSearch = async (
  params: GlobalSearchParams,
  userId?: string,
  userRole?: UserRole
): Promise<GlobalSearchResult> => {
  const { query, types, limit = 5, highlight = false } = params

  if (!isValidSearchQuery(query)) {
    return {
      query,
      total: 0,
      results: [],
      facets: { courses: 0, materials: 0, users: 0, assignments: 0 },
    }
  }

  // Determine which types to search
  const searchTypes = types || ['courses', 'materials', 'users', 'assignments']

  // Run searches in parallel
  const searchPromises: Promise<PaginatedResult<SearchHit>>[] = []
  const typeOrder: SearchEntityType[] = []

  if (searchTypes.includes('courses')) {
    searchPromises.push(searchCourses({ query, page: 1, limit }, userId, userRole))
    typeOrder.push('courses')
  }

  if (searchTypes.includes('materials')) {
    searchPromises.push(searchMaterials({ query, page: 1, limit }, userId, userRole))
    typeOrder.push('materials')
  }

  if (searchTypes.includes('users')) {
    searchPromises.push(searchUsers({ query, page: 1, limit }, userId, userRole))
    typeOrder.push('users')
  }

  if (searchTypes.includes('assignments')) {
    searchPromises.push(searchAssignments({ query, page: 1, limit }, userId, userRole))
    typeOrder.push('assignments')
  }

  const results = await Promise.all(searchPromises)

  // Combine results
  const allResults: SearchHit[] = []
  const facets = { courses: 0, materials: 0, users: 0, assignments: 0 }

  results.forEach((result: PaginatedResult<SearchHit>, index: number) => {
    const type = typeOrder[index]
    facets[type] = result.total

    // Apply highlighting if requested
    const hits = highlight
      ? result.data.map((hit: SearchHit) => ({
          ...hit,
          title: highlightSearchTerms(hit.title, query),
          snippet: hit.snippet ? highlightSearchTerms(hit.snippet, query) : undefined,
        }))
      : result.data

    allResults.push(...hits)
  })

  // Sort by relevance (for now, just interleave results)
  // In a production system, you'd want proper relevance scoring

  return {
    query,
    total: Object.values(facets).reduce((a, b) => a + b, 0),
    results: allResults.slice(0, limit * typeOrder.length),
    facets,
  }
}
