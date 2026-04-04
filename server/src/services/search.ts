/**
 * Search Utilities
 * 
 * Provides full-text search, fuzzy matching, and filtering utilities
 * for PostgreSQL/Supabase queries.
 */

// ============================================
// Types
// ============================================

export type SearchMode = 'exact' | 'contains' | 'prefix' | 'fuzzy' | 'fulltext'

export interface SearchParams {
  query: string
  mode?: SearchMode
  columns?: string[]
  caseSensitive?: boolean
}

export interface SearchConfig {
  minLength?: number
  fuzzyThreshold?: number
  maxResults?: number
}

export interface SearchResult<T> {
  data: T[]
  total: number
  query: string
}

export interface FuzzyMatch {
  value: string
  score: number
}

// ============================================
// Constants
// ============================================

export const SEARCH_DEFAULTS = {
  minLength: 2,
  fuzzyThreshold: 0.3,
  maxResults: 100,
  mode: 'contains' as SearchMode,
} as const

// ============================================
// Search Utilities
// ============================================

/**
 * Sanitize search query
 */
export const sanitizeSearchQuery = (query: string): string => {
  // Remove leading/trailing whitespace
  query = query.trim()

  // Escape special characters for SQL LIKE
  query = query.replace(/[%_]/g, '\\$&')

  return query
}

/**
 * Build search pattern for LIKE/ILIKE
 */
export const buildSearchPattern = (
  query: string,
  mode: 'exact' | 'contains' | 'prefix' = 'contains'
): string => {
  const sanitized = sanitizeSearchQuery(query)

  switch (mode) {
    case 'exact':
      return sanitized
    case 'prefix':
      return `${sanitized}%`
    case 'contains':
    default:
      return `%${sanitized}%`
  }
}

/**
 * Apply search filter to Supabase query
 */
export const applySearch = (
  query: any,
  searchParams: SearchParams
): any => {
  if (!searchParams.query || searchParams.query.length < SEARCH_DEFAULTS.minLength) {
    return query
  }

  const { query: searchQuery, mode = 'contains', columns, caseSensitive = false } = searchParams

  if (!columns || columns.length === 0) {
    return query
  }

  const pattern = buildSearchPattern(searchQuery, mode as 'exact' | 'contains' | 'prefix')
  const operator = caseSensitive ? 'like' : 'ilike'

  // For single column search
  if (columns.length === 1) {
    return query[operator](columns[0], pattern)
  }

  // For multi-column search, use OR conditions
  // Note: Supabase doesn't support complex OR directly, so we use filter syntax
  const orConditions = columns.map((col) => `${col}.${operator}.${pattern}`).join(',')
  return query.or(orConditions)
}

/**
 * Search across multiple columns
 */
export const searchMultipleColumns = (
  query: any,
  columns: string[],
  searchTerm: string,
  caseSensitive = false
): any => {
  return applySearch(query, {
    query: searchTerm,
    columns,
    mode: 'contains',
    caseSensitive,
  })
}

/**
 * Exact match search
 */
export const exactSearch = (
  query: any,
  column: string,
  value: string,
  caseSensitive = false
): any => {
  if (caseSensitive) {
    return query.eq(column, value)
  }
  return query.ilike(column, value)
}

/**
 * Prefix search (starts with)
 */
export const prefixSearch = (
  query: any,
  column: string,
  prefix: string,
  caseSensitive = false
): any => {
  return applySearch(query, {
    query: prefix,
    columns: [column],
    mode: 'prefix',
    caseSensitive,
  })
}

// ============================================
// Full-Text Search (PostgreSQL)
// ============================================

/**
 * Build PostgreSQL text search query
 */
export const buildTextSearchQuery = (searchTerm: string): string => {
  // Convert space-separated words to AND operator
  const terms = searchTerm
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .join(' & ')

  return terms
}

/**
 * Apply PostgreSQL full-text search
 * 
 * Note: Requires a tsvector column in the table
 * Example: search_vector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || description)) STORED
 */
export const applyFullTextSearch = (
  query: any,
  searchColumn: string,
  searchTerm: string
): any => {
  const tsquery = buildTextSearchQuery(searchTerm)
  return query.textSearch(searchColumn, tsquery)
}

// ============================================
// Fuzzy Matching
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 */
export const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length
  const len2 = str2.length
  const matrix: number[][] = []

  if (len1 === 0) return len2
  if (len2 === 0) return len1

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[len1][len2]
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const distance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase())
  return (longer.length - distance) / longer.length
}

/**
 * Find fuzzy matches in an array
 */
export const findFuzzyMatches = <T>(
  items: T[],
  searchTerm: string,
  getField: (item: T) => string,
  threshold: number = SEARCH_DEFAULTS.fuzzyThreshold
): Array<T & { score: number }> => {
  const matches = items
    .map((item) => ({
      ...item,
      score: calculateSimilarity(searchTerm, getField(item)),
    }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)

  return matches
}

// ============================================
// Search Highlighting
// ============================================

/**
 * Highlight search terms in text
 */
export const highlightSearchTerms = (
  text: string,
  searchTerm: string,
  highlightTag: string = '<mark>',
  closeTag: string = '</mark>'
): string => {
  if (!searchTerm || !text) return text

  const sanitized = sanitizeSearchQuery(searchTerm)
  const regex = new RegExp(`(${sanitized})`, 'gi')

  return text.replace(regex, `${highlightTag}$1${closeTag}`)
}

/**
 * Extract text snippet around search term
 */
export const extractSnippet = (
  text: string,
  searchTerm: string,
  contextLength: number = 100
): string => {
  if (!searchTerm || !text) return text.substring(0, contextLength * 2)

  const lowerText = text.toLowerCase()
  const lowerTerm = searchTerm.toLowerCase()
  const index = lowerText.indexOf(lowerTerm)

  if (index === -1) {
    return text.substring(0, contextLength * 2)
  }

  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + searchTerm.length + contextLength)

  let snippet = text.substring(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  return snippet
}

// ============================================
// Advanced Search Filters
// ============================================

/**
 * Apply date range filter
 */
export const applyDateRange = (
  query: any,
  column: string,
  startDate?: string | Date,
  endDate?: string | Date
): any => {
  if (startDate) {
    query = query.gte(column, startDate instanceof Date ? startDate.toISOString() : startDate)
  }
  if (endDate) {
    query = query.lte(column, endDate instanceof Date ? endDate.toISOString() : endDate)
  }
  return query
}

/**
 * Apply numeric range filter
 */
export const applyNumericRange = (
  query: any,
  column: string,
  min?: number,
  max?: number
): any => {
  if (min !== undefined) {
    query = query.gte(column, min)
  }
  if (max !== undefined) {
    query = query.lte(column, max)
  }
  return query
}

/**
 * Apply IN filter (array of values)
 */
export const applyInFilter = (
  query: any,
  column: string,
  values: any[]
): any => {
  if (!values || values.length === 0) return query
  return query.in(column, values)
}

/**
 * Apply NOT IN filter
 */
export const applyNotInFilter = (
  query: any,
  column: string,
  values: any[]
): any => {
  if (!values || values.length === 0) return query
  // Supabase doesn't have direct "not in", use neq with or
  const conditions = values.map((v) => `${column}.neq.${v}`).join(',')
  return query.or(conditions)
}

/**
 * Apply NULL/NOT NULL filter
 */
export const applyNullFilter = (
  query: any,
  column: string,
  isNull: boolean
): any => {
  return query.is(column, isNull ? null : 'not.null')
}

// ============================================
// Combined Search
// ============================================

/**
 * Apply multiple search filters
 */
export const applyMultipleFilters = (
  query: any,
  filters: Array<{
    type: 'search' | 'date' | 'numeric' | 'in' | 'exact'
    column?: string
    columns?: string[]
    value?: any
    min?: number
    max?: number
    start?: string | Date
    end?: string | Date
    values?: any[]
  }>
): any => {
  for (const filter of filters) {
    switch (filter.type) {
      case 'search':
        if (filter.columns && filter.value) {
          query = applySearch(query, {
            query: filter.value,
            columns: filter.columns,
          })
        }
        break
      case 'date':
        if (filter.column) {
          query = applyDateRange(query, filter.column, filter.start, filter.end)
        }
        break
      case 'numeric':
        if (filter.column) {
          query = applyNumericRange(query, filter.column, filter.min, filter.max)
        }
        break
      case 'in':
        if (filter.column && filter.values) {
          query = applyInFilter(query, filter.column, filter.values)
        }
        break
      case 'exact':
        if (filter.column && filter.value !== undefined) {
          query = query.eq(filter.column, filter.value)
        }
        break
    }
  }
  return query
}

// ============================================
// Validation
// ============================================

/**
 * Validate search query
 */
export const isValidSearchQuery = (
  query: string,
  minLength: number = SEARCH_DEFAULTS.minLength
): boolean => {
  return typeof query === 'string' && query.trim().length >= minLength
}

/**
 * Validate search params
 */
export const validateSearchParams = (params: SearchParams): string | null => {
  if (!params.query) {
    return 'Search query is required'
  }

  if (params.query.length < SEARCH_DEFAULTS.minLength) {
    return `Search query must be at least ${SEARCH_DEFAULTS.minLength} characters`
  }

  if (params.columns && params.columns.length === 0) {
    return 'At least one search column is required'
  }

  return null
}
