/**
 * Pagination Service
 * 
 * Provides reusable pagination utilities for consistent handling of large datasets.
 * Supports both offset-based (traditional page numbers) and cursor-based (infinite scroll) pagination.
 */

// ============================================
// Types
// ============================================

export interface PaginationParams {
  page?: number | string
  limit?: number | string
  cursor?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface CursorPaginationMeta {
  limit: number
  nextCursor?: string
  prevCursor?: string
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  meta: PaginationMeta
}

export interface CursorPaginatedResponse<T> {
  success: true
  data: T[]
  meta: CursorPaginationMeta
}

// Simpler result type for service layer
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
}

export interface PaginationConfig {
  defaultLimit?: number
  maxLimit?: number
  minLimit?: number
}

// ============================================
// Constants
// ============================================

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 10,
  minLimit: 1,
  maxLimit: 100,
  defaultLimit: 10,
} as const

// ============================================
// Pagination Utilities
// ============================================

/**
 * Parse and validate pagination parameters
 */
export const parsePaginationParams = (
  params: PaginationParams,
  config: PaginationConfig = {}
): { page: number; limit: number; offset: number } => {
  const defaultLimit = config.defaultLimit || PAGINATION_DEFAULTS.defaultLimit
  const maxLimit = config.maxLimit || PAGINATION_DEFAULTS.maxLimit
  const minLimit = config.minLimit || PAGINATION_DEFAULTS.minLimit

  // Parse page
  let page = typeof params.page === 'string' ? parseInt(params.page, 10) : params.page
  if (!page || page < 1 || isNaN(page)) {
    page = PAGINATION_DEFAULTS.page
  }

  // Parse limit
  let limit = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit
  if (!limit || isNaN(limit)) {
    limit = defaultLimit
  }

  // Enforce limit bounds
  limit = Math.max(minLimit, Math.min(maxLimit, limit))

  // Calculate offset
  const offset = (page - 1) * limit

  return { page, limit, offset }
}

/**
 * Calculate pagination metadata
 */
export const calculatePaginationMeta = (
  total: number,
  page: number,
  limit: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit)

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  }
}

/**
 * Create a paginated response
 */
export const createPaginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> => {
  return {
    success: true,
    data,
    meta: calculatePaginationMeta(total, page, limit),
  }
}

/**
 * Paginate a Supabase query (offset-based)
 */
export const paginateQuery = async <T>(
  query: any, // Supabase query builder
  params: PaginationParams,
  config?: PaginationConfig
): Promise<{ data: T[]; count: number; page: number; limit: number }> => {
  const { page, limit, offset } = parsePaginationParams(params, config)

  // Get total count
  const { count, error: countError } = await query.select('*', { count: 'exact', head: true })

  if (countError) {
    throw new Error(`Failed to count records: ${countError.message}`)
  }

  // Get paginated data
  const { data, error: dataError } = await query
    .select('*')
    .range(offset, offset + limit - 1)

  if (dataError) {
    throw new Error(`Failed to fetch records: ${dataError.message}`)
  }

  return {
    data: data || [],
    count: count || 0,
    page,
    limit,
  }
}

/**
 * Apply pagination to a Supabase query builder
 */
export const applyPagination = (
  query: any,
  page: number,
  limit: number
) => {
  const offset = (page - 1) * limit
  return query.range(offset, offset + limit - 1)
}

// ============================================
// Cursor-Based Pagination
// ============================================

/**
 * Encode cursor from object
 */
export const encodeCursor = (data: Record<string, any>): string => {
  return Buffer.from(JSON.stringify(data)).toString('base64')
}

/**
 * Decode cursor to object
 */
export const decodeCursor = (cursor: string): Record<string, any> | null => {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Create cursor from record
 */
export const createCursor = <T extends Record<string, any>>(
  record: T,
  cursorField: keyof T = 'id'
): string => {
  return encodeCursor({
    [cursorField]: record[cursorField],
    _timestamp: new Date().toISOString(),
  })
}

/**
 * Apply cursor pagination to query
 */
export const applyCursorPagination = (
  query: any,
  cursor: string | undefined,
  limit: number,
  cursorField: string = 'id',
  direction: 'forward' | 'backward' = 'forward'
) => {
  const safeLimit = Math.min(limit, PAGINATION_DEFAULTS.maxLimit)

  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded && decoded[cursorField]) {
      if (direction === 'forward') {
        query = query.gt(cursorField, decoded[cursorField])
      } else {
        query = query.lt(cursorField, decoded[cursorField])
      }
    }
  }

  return query.limit(safeLimit + 1) // Fetch one extra to determine hasNextPage
}

/**
 * Process cursor paginated results
 */
export const processCursorResults = <T extends Record<string, any>>(
  results: T[],
  limit: number,
  cursorField: keyof T = 'id'
): {
  data: T[]
  hasNextPage: boolean
  nextCursor?: string
} => {
  const hasNextPage = results.length > limit
  const data = hasNextPage ? results.slice(0, limit) : results

  const nextCursor = hasNextPage && data.length > 0
    ? createCursor(data[data.length - 1], cursorField)
    : undefined

  return {
    data,
    hasNextPage,
    nextCursor,
  }
}

/**
 * Create cursor paginated response
 */
export const createCursorPaginatedResponse = <T>(
  data: T[],
  limit: number,
  nextCursor?: string,
  prevCursor?: string
): CursorPaginatedResponse<T> => {
  return {
    success: true,
    data,
    meta: {
      limit,
      nextCursor,
      prevCursor,
      hasNextPage: !!nextCursor,
      hasPrevPage: !!prevCursor,
    },
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get offset and limit from range
 */
export const getRangeFromPage = (page: number, limit: number): { from: number; to: number } => {
  const offset = (page - 1) * limit
  return {
    from: offset,
    to: offset + limit - 1,
  }
}

/**
 * Get page number from offset
 */
export const getPageFromOffset = (offset: number, limit: number): number => {
  return Math.floor(offset / limit) + 1
}

/**
 * Check if there are more pages
 */
export const hasMorePages = (total: number, page: number, limit: number): boolean => {
  return page * limit < total
}

/**
 * Calculate total pages
 */
export const getTotalPages = (total: number, limit: number): number => {
  return Math.ceil(total / limit)
}

/**
 * Validate page number
 */
export const isValidPage = (page: number, totalPages: number): boolean => {
  return page >= 1 && page <= totalPages
}

/**
 * Get safe page number (clamp to valid range)
 */
export const getSafePage = (page: number, totalPages: number): number => {
  if (page < 1) return 1
  if (page > totalPages) return totalPages
  return page
}
