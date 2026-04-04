/**
 * Query Builder
 * 
 * Composable query builder for Supabase with integrated pagination,
 * search, filtering, and sorting capabilities.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../lib/supabase.js'
import * as paginationService from './pagination.js'
import * as searchService from './search.js'
import { PaginationParams, PaginatedResponse } from './pagination.js'
import { SearchParams } from './search.js'

// ============================================
// Types
// ============================================

export type FilterOperator =
  | 'eq'        // equals
  | 'neq'       // not equals
  | 'gt'        // greater than
  | 'gte'       // greater than or equal
  | 'lt'        // less than
  | 'lte'       // less than or equal
  | 'in'        // in array
  | 'contains'  // contains substring
  | 'like'      // SQL LIKE pattern
  | 'ilike'     // case-insensitive LIKE
  | 'is'        // IS NULL / IS NOT NULL
  | 'fts'       // full-text search

export type SortDirection = 'asc' | 'desc'

export interface Filter {
  field: string
  operator: FilterOperator
  value: any
}

export interface SortConfig {
  field: string
  direction?: SortDirection
  nulls?: 'first' | 'last'
}

export interface QueryBuilderOptions {
  client?: SupabaseClient
  select?: string
  single?: boolean
}

// ============================================
// Query Builder Class
// ============================================

export class QueryBuilder<T = any> {
  private client: SupabaseClient
  private tableName: string
  private selectColumns: string
  private filterList: Filter[] = []
  private searchParams?: SearchParams
  private sortList: SortConfig[] = []
  private paginationParams?: PaginationParams
  private limitValue?: number
  private singleResult: boolean = false

  constructor(tableName: string, options: QueryBuilderOptions = {}) {
    this.client = options.client || supabaseAdmin
    this.tableName = tableName
    this.selectColumns = options.select || '*'
    this.singleResult = options.single || false
  }

  /**
   * Set columns to select
   */
  select(columns: string): this {
    this.selectColumns = columns
    return this
  }

  /**
   * Add a filter condition
   */
  filter(field: string, operator: FilterOperator, value: any): this {
    this.filterList.push({ field, operator, value })
    return this
  }

  /**
   * Add multiple filters
   */
  filters(filters: Filter[]): this {
    this.filterList.push(...filters)
    return this
  }

  /**
   * Add search across columns
   */
  search(columns: string[], query: string, mode?: searchService.SearchMode): this {
    if (query && query.trim().length >= searchService.SEARCH_DEFAULTS.minLength) {
      this.searchParams = {
        query,
        columns,
        mode,
      }
    }
    return this
  }

  /**
   * Add sorting
   */
  sort(field: string, direction: SortDirection = 'asc', nulls?: 'first' | 'last'): this {
    this.sortList.push({ field, direction, nulls })
    return this
  }

  /**
   * Add multiple sort configurations
   */
  sorts(sorts: SortConfig[]): this {
    this.sortList.push(...sorts)
    return this
  }

  /**
   * Set pagination parameters
   */
  paginate(params: PaginationParams): this {
    this.paginationParams = params
    return this
  }

  /**
   * Set limit (for non-paginated queries)
   */
  limit(limit: number): this {
    this.limitValue = limit
    return this
  }

  /**
   * Return single result instead of array
   */
  single(): this {
    this.singleResult = true
    return this
  }

  /**
   * Build the Supabase query
   */
  private buildQuery() {
    let query = this.client.from(this.tableName).select(this.selectColumns)

    // Apply filters
    for (const filter of this.filterList) {
      query = this.applyFilter(query, filter)
    }

    // Apply search
    if (this.searchParams) {
      query = searchService.applySearch(query, this.searchParams)
    }

    // Apply sorting
    for (const sort of this.sortList) {
      const options: any = { ascending: sort.direction === 'asc' }
      if (sort.nulls) {
        options.nullsFirst = sort.nulls === 'first'
      }
      query = query.order(sort.field, options)
    }

    return query
  }

  /**
   * Apply a single filter to query
   */
  private applyFilter(query: any, filter: Filter): any {
    const { field, operator, value } = filter

    switch (operator) {
      case 'eq':
        return query.eq(field, value)
      case 'neq':
        return query.neq(field, value)
      case 'gt':
        return query.gt(field, value)
      case 'gte':
        return query.gte(field, value)
      case 'lt':
        return query.lt(field, value)
      case 'lte':
        return query.lte(field, value)
      case 'in':
        return query.in(field, value)
      case 'contains':
        return query.ilike(field, `%${value}%`)
      case 'like':
        return query.like(field, value)
      case 'ilike':
        return query.ilike(field, value)
      case 'is':
        return query.is(field, value)
      case 'fts':
        return query.textSearch(field, value)
      default:
        return query
    }
  }

  /**
   * Execute query with pagination
   */
  async executePaginated(): Promise<PaginatedResponse<T>> {
    if (!this.paginationParams) {
      throw new Error('Pagination parameters not set. Call paginate() before executePaginated()')
    }

    const query = this.buildQuery()
    const { data, count, page, limit } = await paginationService.paginateQuery<T>(
      query,
      this.paginationParams
    )

    return paginationService.createPaginatedResponse(data, count, page, limit)
  }

  /**
   * Execute query without pagination
   */
  async execute(): Promise<{ data: T[]; error: any }> {
    let query = this.buildQuery()

    // Apply limit if set
    if (this.limitValue) {
      query = query.limit(this.limitValue)
    }

    // Execute single or multiple
    if (this.singleResult) {
      const { data, error } = await query.single()
      return { data: data ? [data as T] : [], error }
    } else {
      const result = await query
      return { data: (result.data || []) as T[], error: result.error }
    }
  }

  /**
   * Execute and return single result
   */
  async executeOne(): Promise<{ data: T | null; error: any }> {
    const query = this.buildQuery().limit(1).single()
    const { data, error } = await query
    return { data: data as T | null, error }
  }

  /**
   * Get count only (no data)
   */
  async count(): Promise<{ count: number; error: any }> {
    let query = this.client.from(this.tableName).select('*', { count: 'exact', head: true })
    
    // Apply filters only (not select/sort)
    for (const filter of this.filterList) {
      query = this.applyFilter(query, filter)
    }
    
    const { count, error } = await query
    return { count: count || 0, error }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new query builder
 */
export const createQueryBuilder = <T = any>(
  tableName: string,
  options?: QueryBuilderOptions
): QueryBuilder<T> => {
  return new QueryBuilder<T>(tableName, options)
}

/**
 * Quick filter helper
 */
export const quickQuery = <T = any>(
  tableName: string,
  filters: Record<string, any>,
  options?: QueryBuilderOptions
): QueryBuilder<T> => {
  const builder = new QueryBuilder<T>(tableName, options)

  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      builder.filter(field, 'eq', value)
    }
  }

  return builder
}

// ============================================
// Common Query Patterns
// ============================================

/**
 * Build a paginated list query
 */
export const buildListQuery = <T = any>(
  tableName: string,
  params: {
    page?: number
    limit?: number
    search?: string
    searchColumns?: string[]
    filters?: Filter[]
    sort?: SortConfig | SortConfig[]
  }
): QueryBuilder<T> => {
  const builder = new QueryBuilder<T>(tableName)

  // Apply pagination
  if (params.page || params.limit) {
    builder.paginate({
      page: params.page,
      limit: params.limit,
    })
  }

  // Apply search
  if (params.search && params.searchColumns) {
    builder.search(params.searchColumns, params.search)
  }

  // Apply filters
  if (params.filters) {
    builder.filters(params.filters)
  }

  // Apply sorting
  if (params.sort) {
    const sorts = Array.isArray(params.sort) ? params.sort : [params.sort]
    builder.sorts(sorts)
  }

  return builder
}

/**
 * Find by ID
 */
export const findById = async <T = any>(
  tableName: string,
  id: string,
  select?: string
): Promise<{ data: T | null; error: any }> => {
  return await createQueryBuilder<T>(tableName, { select })
    .filter('id', 'eq', id)
    .executeOne()
}

/**
 * Find one by criteria
 */
export const findOne = async <T = any>(
  tableName: string,
  filters: Record<string, any>,
  select?: string
): Promise<{ data: T | null; error: any }> => {
  const builder = createQueryBuilder<T>(tableName, { select })

  for (const [field, value] of Object.entries(filters)) {
    builder.filter(field, 'eq', value)
  }

  return await builder.executeOne()
}

/**
 * Find all by criteria
 */
export const findAll = async <T = any>(
  tableName: string,
  filters: Record<string, any> = {},
  options?: {
    select?: string
    sort?: SortConfig
    limit?: number
  }
): Promise<{ data: T[]; error: any }> => {
  const builder = createQueryBuilder<T>(tableName, { select: options?.select })

  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) {
      builder.filter(field, 'eq', value)
    }
  }

  if (options?.sort) {
    builder.sort(options.sort.field, options.sort.direction, options.sort.nulls)
  }

  if (options?.limit) {
    builder.limit(options.limit)
  }

  return await builder.execute()
}

/**
 * Search and paginate
 */
export const searchAndPaginate = async <T = any>(
  tableName: string,
  params: {
    search: string
    searchColumns: string[]
    page?: number
    limit?: number
    filters?: Filter[]
    sort?: SortConfig
  }
): Promise<PaginatedResponse<T>> => {
  const builder = createQueryBuilder<T>(tableName)
    .search(params.searchColumns, params.search)
    .paginate({ page: params.page, limit: params.limit })

  if (params.filters) {
    builder.filters(params.filters)
  }

  if (params.sort) {
    builder.sort(params.sort.field, params.sort.direction, params.sort.nulls)
  }

  return await builder.executePaginated()
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate filter operator
 */
export const isValidOperator = (operator: string): operator is FilterOperator => {
  const validOperators: FilterOperator[] = [
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
    'contains', 'like', 'ilike', 'is', 'fts'
  ]
  return validOperators.includes(operator as FilterOperator)
}

/**
 * Validate sort direction
 */
export const isValidSortDirection = (direction: string): direction is SortDirection => {
  return direction === 'asc' || direction === 'desc'
}
