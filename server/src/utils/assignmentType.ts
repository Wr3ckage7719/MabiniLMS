import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import logger from './logger.js';

let supportsAssignmentTypeColumnCache: boolean | undefined;

const isMissingAssignmentTypeColumnError = (message?: string): boolean => {
  const normalized = (message || '').toLowerCase();
  return (
    normalized.includes('column') &&
    normalized.includes('assignment_type') &&
    normalized.includes('does not exist')
  );
};

export const supportsAssignmentTypeColumn = async (): Promise<boolean> => {
  if (supportsAssignmentTypeColumnCache !== undefined) {
    return supportsAssignmentTypeColumnCache;
  }

  const { error } = await supabaseAdmin
    .from('assignments')
    .select('id, assignment_type')
    .limit(1);

  if (!error) {
    supportsAssignmentTypeColumnCache = true;
    return true;
  }

  if (isMissingAssignmentTypeColumnError(error.message)) {
    supportsAssignmentTypeColumnCache = false;
    logger.warn('assignments.assignment_type column is missing; falling back to activity category');
    return false;
  }

  logger.error('Failed to probe assignment_type column support', {
    error: error.message,
  });
  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load assignment schema metadata', 500);
};

export const normalizeAssignmentType = (value: unknown): 'exam' | 'quiz' | 'activity' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'exam' || normalized === 'quiz' || normalized === 'activity') {
    return normalized;
  }
  return 'activity';
};
