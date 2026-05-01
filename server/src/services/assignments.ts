import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  Assignment,
  AssignmentWithCourse,
  AssignmentCommentWithAuthor,
  CreateAssignmentCommentInput,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  ListAssignmentsQuery,
  Submission,
  SubmissionWithStudent,
  SubmissionWithGrade,
  SubmissionStorageDiagnosticsReport,
  SubmissionStorageDiagnosticEntry,
  SubmissionStatusHistoryEntry,
  CreateSubmissionInput,
  TransitionSubmissionStatusInput,
  SubmissionStatus,
} from '../types/assignments.js';
import {
  normalizeSubmissionStorageInput,
  prepareSubmissionStorageSnapshot,
  normalizeSubmissionStorageSnapshotForRead,
  summarizeSubmissionStorageConsistencyIssues,
} from './submission-storage.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import { sendAssignmentCreatedNotification } from './notifications.js';
import { notifyAssignmentCreated, notifyStandingUpdated, notifySubmissionReceived } from './websocket.js';
import logger from '../utils/logger.js';
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';
import { assertAssessmentUnlocked } from './assessment-gating.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixCommentAuthorJoin = (comment: any): AssignmentCommentWithAuthor => {
  const author = Array.isArray(comment.author) ? comment.author[0] || null : comment.author;
  return {
    ...comment,
    author,
  } as AssignmentCommentWithAuthor;
};

type DatabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const ASSIGNMENT_COMPAT_OPTIONAL_COLUMNS = new Set<string>([
  'assignment_type',
  'grading_period',
  'question_order_mode',
  'exam_question_selection_mode',
  'exam_chapter_pool',
  'created_at',
  'submissions_open',
  'submission_open_at',
  'submission_close_at',
  'is_proctored',
  'exam_duration_minutes',
  'proctoring_policy',
  'topics',
]);

const sanitizeTopicsInput = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 40) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= 10) break;
  }

  return out;
};

const DEFAULT_PROCTORING_POLICY: Record<string, unknown> = {
  max_violations: 3,
  terminate_on_fullscreen_exit: false,
  auto_submit_on_tab_switch: false,
  auto_submit_on_fullscreen_exit: false,
  require_agreement_before_start: true,
  block_clipboard: true,
  block_context_menu: true,
  block_print_shortcut: true,
  one_question_at_a_time: false,
};

type AssignmentInputWithAliases = Partial<CreateAssignmentInput & UpdateAssignmentInput> & Record<string, unknown>;

const resolveModeValue = (value: unknown): 'sequence' | 'random' | undefined => {
  if (value === 'sequence' || value === 'random') {
    return value;
  }

  return undefined;
};

const resolveQuestionOrderMode = (input: AssignmentInputWithAliases): 'sequence' | 'random' | undefined => {
  return (
    resolveModeValue(input.question_order_mode)
    || resolveModeValue(input.question_order)
    || resolveModeValue(input.order_mode)
  );
};

const resolveExamSelectionMode = (input: AssignmentInputWithAliases): 'sequence' | 'random' | undefined => {
  return (
    resolveModeValue(input.exam_question_selection_mode)
    || resolveModeValue(input.exam_selection_mode)
  );
};

const resolveExamChapterPool = (
  input: AssignmentInputWithAliases
): CreateAssignmentInput['exam_chapter_pool'] | undefined => {
  if (input.exam_chapter_pool && typeof input.exam_chapter_pool === 'object') {
    return input.exam_chapter_pool;
  }

  if (input.chapter_pool && typeof input.chapter_pool === 'object') {
    return input.chapter_pool as CreateAssignmentInput['exam_chapter_pool'];
  }

  return undefined;
};

const toBoolean = (value: unknown): boolean | undefined => {
  return typeof value === 'boolean' ? value : undefined;
};

const toPositiveInt = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const normalized = Math.floor(numeric);
  if (normalized <= 0) {
    return undefined;
  }

  return Math.min(20, normalized);
};

const normalizeProctoringPolicyInput = (
  rawPolicy: unknown,
  options: { withDefaults: boolean }
): Record<string, unknown> | null | undefined => {
  if (rawPolicy === undefined) {
    return undefined;
  }

  if (rawPolicy === null) {
    return null;
  }

  if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
    return options.withDefaults ? { ...DEFAULT_PROCTORING_POLICY } : undefined;
  }

  const policy = rawPolicy as Record<string, unknown>;

  const terminateOnFullscreenExit =
    toBoolean(policy.terminate_on_fullscreen_exit)
    ?? toBoolean(policy.terminateOnFullscreenExit);

  const normalizedPolicy: Record<string, unknown> = options.withDefaults
    ? { ...DEFAULT_PROCTORING_POLICY }
    : {};

  const maxViolations = toPositiveInt(policy.max_violations ?? policy.maxViolations);
  const autoSubmitOnTabSwitch = toBoolean(policy.auto_submit_on_tab_switch ?? policy.autoSubmitOnTabSwitch);
  const autoSubmitOnFullscreenExit =
    toBoolean(policy.auto_submit_on_fullscreen_exit ?? policy.autoSubmitOnFullscreenExit)
    ?? terminateOnFullscreenExit;
  const requireAgreementBeforeStart =
    toBoolean(policy.require_agreement_before_start ?? policy.requireAgreementBeforeStart);
  const blockClipboard = toBoolean(policy.block_clipboard ?? policy.blockClipboard);
  const blockContextMenu = toBoolean(policy.block_context_menu ?? policy.blockContextMenu);
  const blockPrintShortcut = toBoolean(policy.block_print_shortcut ?? policy.blockPrintShortcut);

  if (maxViolations !== undefined) normalizedPolicy.max_violations = maxViolations;
  if (terminateOnFullscreenExit !== undefined) {
    normalizedPolicy.terminate_on_fullscreen_exit = terminateOnFullscreenExit;
  }
  if (autoSubmitOnTabSwitch !== undefined) {
    normalizedPolicy.auto_submit_on_tab_switch = autoSubmitOnTabSwitch;
  }
  if (autoSubmitOnFullscreenExit !== undefined) {
    normalizedPolicy.auto_submit_on_fullscreen_exit = autoSubmitOnFullscreenExit;
    if (terminateOnFullscreenExit === undefined) {
      normalizedPolicy.terminate_on_fullscreen_exit = autoSubmitOnFullscreenExit;
    }
  }
  if (requireAgreementBeforeStart !== undefined) {
    normalizedPolicy.require_agreement_before_start = requireAgreementBeforeStart;
  }
  if (blockClipboard !== undefined) normalizedPolicy.block_clipboard = blockClipboard;
  if (blockContextMenu !== undefined) normalizedPolicy.block_context_menu = blockContextMenu;
  if (blockPrintShortcut !== undefined) normalizedPolicy.block_print_shortcut = blockPrintShortcut;

  const oneQuestionAtATime = toBoolean(policy.one_question_at_a_time);
  if (oneQuestionAtATime !== undefined) normalizedPolicy.one_question_at_a_time = oneQuestionAtATime;

  if (!options.withDefaults && Object.keys(normalizedPolicy).length === 0) {
    return {};
  }

  return normalizedPolicy;
};

const normalizeDbErrorText = (error?: DatabaseErrorShape | null): string => {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const isMissingRelationError = (
  error?: DatabaseErrorShape | null
): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
};

const extractMissingColumnName = (error?: DatabaseErrorShape | null): string | null => {
  const message = normalizeDbErrorText(error);

  const patterns = [
    /column\s+[a-z0-9_]+\."?([a-z0-9_]+)"?\s+does not exist/i,
    /column\s+"?([a-z0-9_]+)"?\s+does not exist/i,
    /could not find the ['"]([a-z0-9_]+)['"]\s+column/i,
    /record\s+"[^"]+"\s+has no field\s+"?([a-z0-9_]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  return null;
};

const isMissingColumnError = (
  error: DatabaseErrorShape | null | undefined,
  columnName: string
): boolean => {
  const missingColumn = extractMissingColumnName(error);
  if (missingColumn) {
    return missingColumn === columnName.toLowerCase();
  }

  const message = normalizeDbErrorText(error);
  return (
    message.includes('column') &&
    message.includes(columnName.toLowerCase()) &&
    (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('has no field')
    )
  );
};

const isPermissionDeniedError = (error?: DatabaseErrorShape | null): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    error?.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  );
};

const isAssignmentTypeCompatibilityError = (
  error?: DatabaseErrorShape | null
): boolean => {
  const message = normalizeDbErrorText(error);
  return (
    message.includes('assignment_type') &&
    (message.includes('check constraint') ||
      message.includes('invalid input value') ||
      message.includes('violates check constraint'))
  );
};

const isMissingProctoringColumnError = (
  error: DatabaseErrorShape | null | undefined
): boolean => {
  return (
    isMissingColumnError(error, 'is_proctored') ||
    isMissingColumnError(error, 'exam_duration_minutes') ||
    isMissingColumnError(error, 'proctoring_policy')
  );
};

const insertAssignmentWithCompatibility = async (
  payload: Record<string, unknown>,
  context: {
    courseId: string;
    assignmentType: string;
  }
): Promise<{ data: Record<string, unknown> | null; error: DatabaseErrorShape | null }> => {
  const insertPayload: Record<string, unknown> = { ...payload };
  let lastError: DatabaseErrorShape | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .insert(insertPayload)
      .select()
      .single();

    if (!error) {
      return {
        data: (data || {}) as Record<string, unknown>,
        error: null,
      };
    }

    lastError = error;

    if (isAssignmentTypeCompatibilityError(error) && 'assignment_type' in insertPayload) {
      delete insertPayload.assignment_type;

      logger.warn('Retrying assignment insert without assignment_type due schema constraint drift', {
        courseId: context.courseId,
        assignmentType: context.assignmentType,
        attempt: attempt + 1,
        error: error.message,
      });
      continue;
    }

    if (isMissingProctoringColumnError(error)) {
      delete insertPayload.is_proctored;
      delete insertPayload.exam_duration_minutes;
      delete insertPayload.proctoring_policy;

      logger.warn('Retrying assignment insert without proctoring fields', {
        courseId: context.courseId,
        assignmentType: context.assignmentType,
        attempt: attempt + 1,
        error: error.message,
      });
      continue;
    }

    const missingColumn = extractMissingColumnName(error);
    if (
      missingColumn &&
      ASSIGNMENT_COMPAT_OPTIONAL_COLUMNS.has(missingColumn) &&
      Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)
    ) {
      delete insertPayload[missingColumn];

      logger.warn('Retrying assignment insert without optional column', {
        courseId: context.courseId,
        assignmentType: context.assignmentType,
        missingColumn,
        attempt: attempt + 1,
        error: error.message,
      });
      continue;
    }

    return {
      data: null,
      error,
    };
  }

  return {
    data: null,
    error: lastError,
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeAssignmentRecord = (assignment: any): any => {
  if (!assignment || typeof assignment !== 'object') {
    return assignment;
  }

  return {
    ...assignment,
    assignment_type: normalizeAssignmentType(assignment.assignment_type),
    topics: Array.isArray(assignment.topics)
      ? assignment.topics.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [],
  };
};

const getSubmissionBySyncKey = async (
  syncKey: string,
  studentId: string
): Promise<Submission | null> => {
  const { data: syncEvent, error: syncError } = await supabaseAdmin
    .from('submission_sync_events')
    .select('submission_id')
    .eq('student_id', studentId)
    .eq('sync_key', syncKey)
    .maybeSingle();

  if (syncError) {
    if (isMissingRelationError(syncError)) {
      return null;
    }

    logger.error('Failed to read submission sync event', {
      studentId,
      syncKey,
      error: syncError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate submission sync state', 500);
  }

  if (!syncEvent?.submission_id) {
    return null;
  }

  const { data: submission, error: submissionError } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('id', syncEvent.submission_id)
    .single();

  if (submissionError || !submission) {
    if (submissionError?.code === 'PGRST116') {
      return null;
    }

    logger.error('Failed to load synced submission record', {
      studentId,
      syncKey,
      submissionId: syncEvent.submission_id,
      error: submissionError?.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load synced submission', 500);
  }

  return normalizeSubmissionRowForRead(
    submission,
    {
      source: 'submission_sync_lookup',
      assignmentId: (submission as any)?.assignment_id,
    }
  );
};

const recordSubmissionSyncEvent = async (
  syncKey: string,
  studentId: string,
  assignmentId: string,
  submissionId: string
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('submission_sync_events')
    .insert({
      student_id: studentId,
      assignment_id: assignmentId,
      submission_id: submissionId,
      sync_key: syncKey,
      processed_at: new Date().toISOString(),
    });

  if (!error) {
    return;
  }

  if (error.code === '23505' || isMissingRelationError(error)) {
    return;
  }

  logger.warn('Failed to persist submission sync event', {
    studentId,
    assignmentId,
    submissionId,
    syncKey,
    error: error.message,
  });
};

type SubmissionWithAccessContext = SubmissionWithStudent & {
  assignment: SubmissionWithStudent['assignment'] & {
    course_id: string;
    course_teacher_id: string | null;
    course_title: string | null;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixStatusActorJoin = (historyRow: any): SubmissionStatusHistoryEntry => {
  const actor = Array.isArray(historyRow.actor) ? historyRow.actor[0] || null : historyRow.actor;
  return {
    ...historyRow,
    actor,
  } as SubmissionStatusHistoryEntry;
};

const SUBMISSION_STATUS_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  [SubmissionStatus.DRAFT]: [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE],
  [SubmissionStatus.SUBMITTED]: [SubmissionStatus.LATE, SubmissionStatus.UNDER_REVIEW],
  [SubmissionStatus.LATE]: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW],
  [SubmissionStatus.UNDER_REVIEW]: [SubmissionStatus.DRAFT, SubmissionStatus.GRADED],
  [SubmissionStatus.GRADED]: [SubmissionStatus.UNDER_REVIEW],
};

const parseSubmissionStatus = (status: string): SubmissionStatus => {
  const normalizedStatus = (status || '').trim().toLowerCase();

  switch (normalizedStatus) {
    case SubmissionStatus.DRAFT:
      return SubmissionStatus.DRAFT;
    case SubmissionStatus.SUBMITTED:
      return SubmissionStatus.SUBMITTED;
    case SubmissionStatus.LATE:
      return SubmissionStatus.LATE;
    case SubmissionStatus.UNDER_REVIEW:
      return SubmissionStatus.UNDER_REVIEW;
    case SubmissionStatus.GRADED:
      return SubmissionStatus.GRADED;
    default:
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        `Unsupported submission status: ${status}`,
        400
      );
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeSubmissionRowForRead = (
  record: any,
  context: { source: string; assignmentId?: string },
  options: { logIssues?: boolean } = {}
): Submission => {
  const normalizedStorage = normalizeSubmissionStorageSnapshotForRead(record || {});
  const normalized = {
    ...(record || {}),
    ...normalizedStorage,
    status: parseSubmissionStatus(record?.status),
  } as Submission;

  if (
    options.logIssues !== false
    && normalizedStorage.storage_consistency_issues.length > 0
  ) {
    logger.warn('Submission storage consistency fallback applied', {
      source: context.source,
      submissionId: record?.id || null,
      assignmentId: context.assignmentId || record?.assignment_id || null,
      issueCodes: normalizedStorage.storage_consistency_issues.map((issue) => issue.code),
    });
  }

  return normalized;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeSubmissionContext = (record: any): SubmissionWithAccessContext => {
  const assignment = Array.isArray(record.assignment) ? record.assignment[0] || null : record.assignment;
  const course = assignment?.course
    ? (Array.isArray(assignment.course) ? assignment.course[0] || null : assignment.course)
    : null;
  const student = Array.isArray(record.student) ? record.student[0] || null : record.student;
  const normalizedSubmission = normalizeSubmissionRowForRead(
    record,
    {
      source: 'get_submission_with_access_context',
      assignmentId: assignment?.id || record?.assignment_id || undefined,
    }
  );

  return {
    ...normalizedSubmission,
    student,
    assignment: {
      id: assignment?.id,
      title: assignment?.title,
      assignment_type: normalizeAssignmentType(assignment?.assignment_type),
      max_points: assignment?.max_points,
      course_id: assignment?.course_id,
      course_teacher_id: course?.teacher_id || null,
      course_title: course?.title || null,
    },
  } as SubmissionWithAccessContext;
};

const toSubmissionWithStudent = (
  submission: SubmissionWithAccessContext
): SubmissionWithStudent => {
  return {
    ...submission,
    assignment: {
      id: submission.assignment.id,
      title: submission.assignment.title,
      assignment_type: submission.assignment.assignment_type,
      max_points: submission.assignment.max_points,
    },
  } as SubmissionWithStudent;
};

const getSubmissionWithAccessContext = async (
  submissionId: string
): Promise<SubmissionWithAccessContext> => {
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select(`
      id, assignment_id, student_id, content, file_url, drive_file_id, drive_view_link, drive_file_name,
      storage_provider, provider_file_id, provider_revision_id, provider_mime_type, provider_size_bytes,
      provider_checksum, submission_snapshot_at, submitted_at, status,
      student:profiles!submissions_student_id_fkey(id, email, first_name, last_name, role),
      assignment:assignments(
        *,
        course:courses(id, title, teacher_id)
      )
    `)
    .eq('id', submissionId)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Submission not found', 404);
  }

  return normalizeSubmissionContext(data);
};

const assertSubmissionAccess = (
  submission: SubmissionWithAccessContext,
  userId: string,
  userRole: UserRole
): void => {
  if (userRole === UserRole.ADMIN) {
    return;
  }

  if (userRole === UserRole.TEACHER) {
    if (submission.assignment.course_teacher_id === userId) {
      return;
    }

    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only access submissions for your own courses',
      403
    );
  }

  if (submission.student_id === userId) {
    return;
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You can only access your own submission',
    403
  );
};

const recordSubmissionStatusHistory = async (
  submissionId: string,
  fromStatus: SubmissionStatus | null,
  toStatus: SubmissionStatus,
  changedBy: string | null,
  reason?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('submission_status_history')
    .insert({
      submission_id: submissionId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: changedBy,
      reason: reason?.trim() || null,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    });

  if (!error) {
    return;
  }

  if (isMissingRelationError(error)) {
    logger.warn('submission_status_history table missing; status transition history not recorded', {
      submissionId,
      fromStatus,
      toStatus,
      changedBy,
    });
    return;
  }

  logger.error('Failed to record submission status history', {
    submissionId,
    fromStatus,
    toStatus,
    changedBy,
    error: error.message,
  });

  throw new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'Failed to record submission status history',
    500
  );
};

const assertTransitionAllowedForRole = (
  submission: SubmissionWithAccessContext,
  _currentStatus: SubmissionStatus,
  targetStatus: SubmissionStatus,
  userId: string,
  userRole: UserRole
): void => {
  if (userRole === UserRole.ADMIN) {
    return;
  }

  if (userRole === UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Students cannot transition submission status directly. Submit through the assignment submission flow instead.',
      403
    );
  }

  if (submission.assignment.course_teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only transition submissions in your own courses',
      403
    );
  }

  const teacherAllowedTargets = [
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.DRAFT,
    SubmissionStatus.GRADED,
  ];

  if (!teacherAllowedTargets.includes(targetStatus)) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Teachers can only move submissions to under review, graded, or draft revision state',
      403
    );
  }
};

// ============================================
// Assignment Operations
// ============================================

/**
 * Create a new assignment
 */
export const createAssignment = async (
  courseId: string,
  input: CreateAssignmentInput,
  userId: string,
  userRole: UserRole
): Promise<Assignment> => {
  // Verify course exists and user is teacher/admin
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, title, teacher_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only create assignments for your own courses',
      403
    );
  }

  const normalizedInput = input as AssignmentInputWithAliases;
  const assignmentType = input.assignment_type || 'activity';
  const isExamAssignment = assignmentType === 'exam';
  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn();
  const questionOrderMode = resolveQuestionOrderMode(normalizedInput);
  const examSelectionMode = resolveExamSelectionMode(normalizedInput);
  const examChapterPool = resolveExamChapterPool(normalizedInput);

  const insertPayload: Record<string, unknown> = {
    course_id: courseId,
    title: input.title,
    description: input.description || null,
    due_date: input.due_date || null,
    max_points: input.max_points ?? 100,
    submissions_open: input.submissions_open ?? true,
    submission_open_at: input.submission_open_at || null,
    submission_close_at: input.submission_close_at || null,
    created_at: new Date().toISOString(),
  };

  const topicsForInsert = sanitizeTopicsInput(input.topics);
  if (topicsForInsert !== undefined) {
    insertPayload.topics = topicsForInsert;
  }

  if (hasAssignmentTypeColumn) {
    insertPayload.assignment_type = assignmentType;
  }

  if (input.grading_period) {
    insertPayload.grading_period = input.grading_period;
  }

  if (questionOrderMode) {
    insertPayload.question_order_mode = questionOrderMode;
  }

  if (examSelectionMode) {
    insertPayload.exam_question_selection_mode = examSelectionMode;
  }

  if (examChapterPool) {
    insertPayload.exam_chapter_pool = examChapterPool;
  }

  if (isExamAssignment || typeof input.is_proctored === 'boolean') {
    const normalizedProctoringPolicy = normalizeProctoringPolicyInput(input.proctoring_policy, {
      withDefaults: true,
    });

    insertPayload.is_proctored = input.is_proctored ?? isExamAssignment;
    insertPayload.exam_duration_minutes =
      input.exam_duration_minutes
      ?? (isExamAssignment ? 60 : null);
    insertPayload.proctoring_policy = normalizedProctoringPolicy || {
      ...DEFAULT_PROCTORING_POLICY,
    };
  }

  const { data: insertedAssignment, error } = await insertAssignmentWithCompatibility(
    insertPayload,
    {
      courseId,
      assignmentType,
    }
  );

  if (error || !insertedAssignment?.id) {
    if (isMissingRelationError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Assignment storage is not available. Run migrations 001_initial_schema, 013_proctored_exam_pipeline, and latest migrations.',
        503,
        {
          reason: 'ASSIGNMENTS_SCHEMA_OUTDATED',
          db_code: error?.code,
          db_message: error?.message,
        }
      );
    }

    if (isPermissionDeniedError(error)) {
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        'Database permission denied while creating assignments. Verify SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY uses a service role/secret key.',
        503,
        {
          reason: 'SUPABASE_PERMISSION_DENIED',
          db_code: error?.code,
          db_message: error?.message,
        }
      );
    }

    logger.error('Failed to create assignment', { courseId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create assignment', 500, {
      reason: 'ASSIGNMENT_INSERT_FAILED',
      db_code: error?.code,
      db_message: error?.message,
    });
  }

  const nowIso = new Date().toISOString();
  const data = normalizeAssignmentRecord({
    ...insertedAssignment,
    id: String(insertedAssignment.id),
    course_id: String(insertedAssignment.course_id || courseId),
    title: String(insertedAssignment.title || input.title),
    description:
      typeof insertedAssignment.description === 'string' || insertedAssignment.description === null
        ? insertedAssignment.description
        : input.description || null,
    due_date:
      typeof insertedAssignment.due_date === 'string' || insertedAssignment.due_date === null
        ? insertedAssignment.due_date
        : input.due_date || null,
    max_points:
      typeof insertedAssignment.max_points === 'number'
        ? insertedAssignment.max_points
        : input.max_points ?? 100,
    created_at:
      typeof insertedAssignment.created_at === 'string'
        ? insertedAssignment.created_at
        : nowIso,
  }) as Assignment;

  const effectiveAssignmentType = normalizeAssignmentType(
    (data.assignment_type as string | undefined) || assignmentType
  );

  await notifyAssignmentCreated(courseId, {
    id: data.id,
    title: data.title,
    courseId,
    courseName: course.title || 'Course',
    assignmentType: effectiveAssignmentType,
    dueDate: data.due_date || '',
  });

  try {
    let notificationActor:
      | {
          id: string;
          name?: string;
          avatar_url?: string | null;
        }
      | undefined;

    const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (actorProfileError) {
      logger.warn('Failed to resolve assignment notification actor profile', {
        courseId,
        assignmentId: data.id,
        actorId: userId,
        error: actorProfileError.message,
      });
    } else if (actorProfile?.id) {
      const firstName = actorProfile.first_name?.trim() || '';
      const lastName = actorProfile.last_name?.trim() || '';
      const displayName = `${firstName} ${lastName}`.trim() || actorProfile.email || 'Instructor';

      notificationActor = {
        id: actorProfile.id,
        name: displayName,
        avatar_url: actorProfile.avatar_url || null,
      };
    }

    const { data: enrollments, error: enrollmentError } = await supabaseAdmin
      .from('enrollments')
      .select('student_id')
      .eq('course_id', courseId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES);

    if (enrollmentError) {
      logger.warn('Failed to load student recipients for assignment notifications', {
        courseId,
        assignmentId: data.id,
        error: enrollmentError.message,
      });
    } else {
      const recipientIds = Array.from(
        new Set(
          (enrollments || [])
            .map((enrollment) => enrollment.student_id)
            .filter((studentId): studentId is string => Boolean(studentId) && studentId !== userId)
        )
      );

      await sendAssignmentCreatedNotification(
        recipientIds,
        course.title || 'Course',
        courseId,
        data.title,
        data.id,
        effectiveAssignmentType,
        notificationActor
      );
    }
  } catch (notificationError) {
    logger.warn('Failed to dispatch assignment notifications', {
      courseId,
      assignmentId: data.id,
      error:
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError),
    });
  }

  return normalizeAssignmentRecord(data) as Assignment;
};

/**
 * Get assignment by ID
 */
export const getAssignmentById = async (assignmentId: string): Promise<AssignmentWithCourse> => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select(`
      *,
      course:courses(
        id, title,
        teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
      )
    `)
    .eq('id', assignmentId)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404);
  }

  // Fix the nested array structure from Supabase join
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = data as any;
  const course = Array.isArray(rawData.course) && rawData.course[0] ? rawData.course[0] : rawData.course;
  const teacher = course && Array.isArray(course.teacher) ? course.teacher[0] : course?.teacher;
  
  const result: AssignmentWithCourse = {
    ...normalizeAssignmentRecord(rawData),
    course: course ? {
      ...course,
      teacher: teacher
    } : course
  };

  return result;
};

/**
 * List assignments (filtered by course or user access)
 */
export const listAssignments = async (
  query: ListAssignmentsQuery,
  userId: string,
  userRole: UserRole
): Promise<{ assignments: AssignmentWithCourse[]; total: number }> => {
  let queryBuilder = supabaseAdmin
    .from('assignments')
    .select(`
      *,
      course:courses(
        id, title,
        teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
      )
    `, { count: 'exact' });

  // Filter by course if specified
  if (query.course_id) {
    queryBuilder = queryBuilder.eq('course_id', query.course_id);
  } else {
    // If no course specified, show assignments from enrolled courses (student)
    // or own courses (teacher)
    if (userRole === UserRole.STUDENT) {
      const { data: enrollments } = await supabaseAdmin
        .from('enrollments')
        .select('course_id')
        .eq('student_id', userId)
        .in('status', ACTIVE_ENROLLMENT_STATUSES);

      if (enrollments && enrollments.length > 0) {
        const courseIds = enrollments.map(e => e.course_id);
        queryBuilder = queryBuilder.in('course_id', courseIds);
      } else {
        // No enrollments - return empty
        return { assignments: [], total: 0 };
      }
    } else if (userRole === UserRole.TEACHER) {
      const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id')
        .eq('teacher_id', userId);

      if (courses && courses.length > 0) {
        const courseIds = courses.map(c => c.id);
        queryBuilder = queryBuilder.in('course_id', courseIds);
      } else {
        return { assignments: [], total: 0 };
      }
    }
    // Admin sees all
  }

  // Filter past assignments unless requested
  if (query.include_past !== 'true') {
    const now = new Date().toISOString();
    queryBuilder = queryBuilder.or(`due_date.gte.${now},due_date.is.null`);
  }

  const { data, error, count } = await queryBuilder
    .order('due_date', { ascending: true, nullsFirst: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to list assignments', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list assignments', 500);
  }

  // Fix the nested array structure from Supabase join
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixedData: AssignmentWithCourse[] = (data || []).map((item: any) => {
    const course = Array.isArray(item.course) && item.course[0] ? item.course[0] : item.course;
    const teacher = course && Array.isArray(course.teacher) ? course.teacher[0] : course?.teacher;
    
    return {
      ...normalizeAssignmentRecord(item),
      course: course ? {
        ...course,
        teacher: teacher
      } : course
    };
  });

  return {
    assignments: fixedData,
    total: count || 0,
  };
};

/**
 * Update assignment
 */
export const updateAssignment = async (
  assignmentId: string,
  input: UpdateAssignmentInput,
  userId: string,
  userRole: UserRole
): Promise<Assignment> => {
  const assignment = await getAssignmentById(assignmentId);
  const normalizedInput = input as AssignmentInputWithAliases;

  if (userRole !== UserRole.ADMIN && assignment.course.teacher.id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update your own assignments',
      403
    );
  }

  const updatePayload: Record<string, unknown> = {
    ...normalizedInput,
  };

  const questionOrderModeProvided =
    Object.prototype.hasOwnProperty.call(normalizedInput, 'question_order_mode')
    || Object.prototype.hasOwnProperty.call(normalizedInput, 'question_order')
    || Object.prototype.hasOwnProperty.call(normalizedInput, 'order_mode');
  if (questionOrderModeProvided) {
    const questionOrderMode = resolveQuestionOrderMode(normalizedInput);
    if (questionOrderMode) {
      updatePayload.question_order_mode = questionOrderMode;
    }
  }

  const examSelectionModeProvided =
    Object.prototype.hasOwnProperty.call(normalizedInput, 'exam_question_selection_mode')
    || Object.prototype.hasOwnProperty.call(normalizedInput, 'exam_selection_mode');
  if (examSelectionModeProvided) {
    const examSelectionMode = resolveExamSelectionMode(normalizedInput);
    if (examSelectionMode) {
      updatePayload.exam_question_selection_mode = examSelectionMode;
    }
  }

  const chapterPoolProvided =
    Object.prototype.hasOwnProperty.call(normalizedInput, 'exam_chapter_pool')
    || Object.prototype.hasOwnProperty.call(normalizedInput, 'chapter_pool');
  if (chapterPoolProvided) {
    const examChapterPool = resolveExamChapterPool(normalizedInput);
    if (examChapterPool) {
      updatePayload.exam_chapter_pool = examChapterPool;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalizedInput, 'proctoring_policy')) {
    updatePayload.proctoring_policy = normalizeProctoringPolicyInput(normalizedInput.proctoring_policy, {
      withDefaults: false,
    });
    if (updatePayload.proctoring_policy === undefined) {
      delete updatePayload.proctoring_policy;
    }
  }

  if (Object.prototype.hasOwnProperty.call(normalizedInput, 'topics')) {
    const sanitized = sanitizeTopicsInput(normalizedInput.topics);
    if (sanitized === undefined) {
      delete updatePayload.topics;
    } else {
      updatePayload.topics = sanitized;
    }
  }

  delete updatePayload.question_order;
  delete updatePayload.order_mode;
  delete updatePayload.exam_selection_mode;
  delete updatePayload.chapter_pool;

  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn();
  if (!hasAssignmentTypeColumn) {
    delete updatePayload.assignment_type;
  }

  if (Object.keys(updatePayload).length === 0) {
    return normalizeAssignmentRecord(assignment) as Assignment;
  }

  const mutableUpdatePayload: Record<string, unknown> = { ...updatePayload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('assignments')
      .update(mutableUpdatePayload)
      .eq('id', assignmentId)
      .select()
      .single();

    if (!error) {
      return normalizeAssignmentRecord(data) as Assignment;
    }

    const missingColumn = extractMissingColumnName(error);
    if (
      missingColumn
      && ASSIGNMENT_COMPAT_OPTIONAL_COLUMNS.has(missingColumn)
      && Object.prototype.hasOwnProperty.call(mutableUpdatePayload, missingColumn)
    ) {
      delete mutableUpdatePayload[missingColumn];

      logger.warn('Retrying assignment update without optional column', {
        assignmentId,
        userId,
        missingColumn,
        attempt: attempt + 1,
        error: error.message,
      });

      if (Object.keys(mutableUpdatePayload).length === 0) {
        return normalizeAssignmentRecord(assignment) as Assignment;
      }

      continue;
    }

    logger.error('Failed to update assignment', { assignmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update assignment', 500);
  }

  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update assignment', 500);
};

/**
 * Delete assignment
 */
export const deleteAssignment = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  const assignment = await getAssignmentById(assignmentId);

  if (userRole !== UserRole.ADMIN && assignment.course.teacher.id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only delete your own assignments',
      403
    );
  }

  const { error } = await supabaseAdmin
    .from('assignments')
    .delete()
    .eq('id', assignmentId);

  if (error) {
    logger.error('Failed to delete assignment', { assignmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete assignment', 500);
  }
};

// ============================================
// Submission Operations
// ============================================

/**
 * Submit an assignment with provider-backed file metadata (Google Drive for now).
 */
export const submitAssignment = async (
  assignmentId: string,
  input: CreateSubmissionInput,
  userId: string
): Promise<Submission> => {
  // Get assignment and verify it exists
  const assignment = await getAssignmentById(assignmentId);

  // Check if student is enrolled in the course
  const { data: enrollmentRows, error: enrollmentError } = await supabaseAdmin
    .from('enrollments')
    .select('id, status')
    .eq('course_id', assignment.course_id)
    .eq('student_id', userId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .limit(1);

  if (enrollmentError) {
    logger.error('Failed to verify enrollment before submission', {
      assignmentId,
      courseId: assignment.course_id,
      studentId: userId,
      error: enrollmentError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to verify enrollment status', 500);
  }

  if (!Array.isArray(enrollmentRows) || enrollmentRows.length === 0) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You must be enrolled in the course to submit assignments',
      403
    );
  }

  // LM-gating: block submissions when required learning materials are not
  // yet completed. Runs after the enrolment check so unenrolled callers
  // still get 403, not 423.
  await assertAssessmentUnlocked(assignmentId, userId);

  const now = new Date();
  const submissionsOpen = (assignment as AssignmentWithCourse).submissions_open;
  const submissionOpenAtRaw = (assignment as AssignmentWithCourse).submission_open_at;
  const submissionCloseAtRaw = (assignment as AssignmentWithCourse).submission_close_at;

  // Trust the device timestamp only if it's not in the future relative to the
  // server clock — clamping like this prevents a clock-skewed device from
  // submitting "before" a close window that has already passed on the server.
  const clientSubmittedAt = (() => {
    if (!input.client_submitted_at) return null;
    const parsed = new Date(input.client_submitted_at);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed > now ? null : parsed;
  })();
  const effectiveSubmittedAt = clientSubmittedAt ?? now;
  let submittedAfterClose = false;

  if (typeof submissionsOpen === 'boolean' && !submissionsOpen) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Submissions are currently closed for this assignment',
      403
    );
  }

  if (typeof submissionOpenAtRaw === 'string') {
    const submissionOpenAt = new Date(submissionOpenAtRaw);
    if (Number.isFinite(submissionOpenAt.getTime()) && effectiveSubmittedAt < submissionOpenAt) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Submissions are not open yet for this assignment',
        403
      );
    }
  }

  if (typeof submissionCloseAtRaw === 'string') {
    const submissionCloseAt = new Date(submissionCloseAtRaw);
    if (Number.isFinite(submissionCloseAt.getTime()) && effectiveSubmittedAt > submissionCloseAt) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Submission window has closed for this assignment',
        403
      );
    }

    // Offline-replayed submission: the device captured the work before the
    // window closed but the sync engine only delivered it afterwards. Accept
    // it but flag for teacher review per the offline-first conflict policy.
    if (
      Number.isFinite(submissionCloseAt.getTime())
      && clientSubmittedAt !== null
      && now > submissionCloseAt
    ) {
      submittedAfterClose = true;
    }
  }

  if (input.sync_key) {
    const existingSyncedSubmission = await getSubmissionBySyncKey(input.sync_key, userId);
    if (existingSyncedSubmission) {
      return existingSyncedSubmission;
    }
  }

  const normalizedStorageInput = normalizeSubmissionStorageInput(input);
  const storageSnapshot = await prepareSubmissionStorageSnapshot(normalizedStorageInput, {
    userId,
    teacherEmail: assignment.course.teacher.email,
  });

  // Determine if late — use the device-side timestamp when present so a
  // student who tapped Submit before the deadline isn't penalised because the
  // sync engine only drained the queue afterwards.
  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
  const isLate = dueDate && effectiveSubmittedAt > dueDate;

  const { data: studentProfile } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();
  const studentName = `${studentProfile?.first_name || ''} ${studentProfile?.last_name || ''}`.trim() || 'A student';

  // Check for existing submission
  const { data: existing } = await supabaseAdmin
    .from('submissions')
    .select('id, status')
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId)
    .single();

  const targetStatus = isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED;

  if (existing) {
    const currentStatus = parseSubmissionStatus(existing.status);

    if (
      currentStatus !== SubmissionStatus.DRAFT &&
      currentStatus !== SubmissionStatus.SUBMITTED &&
      currentStatus !== SubmissionStatus.LATE
    ) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Submission cannot be edited while it is under review or already graded',
        403
      );
    }

    // Update existing submission
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({
        drive_file_id: storageSnapshot.legacyDriveFileId,
        drive_file_name: storageSnapshot.legacyDriveFileName,
        drive_view_link: storageSnapshot.legacyDriveViewLink,
        storage_provider: storageSnapshot.storageProvider,
        provider_file_id: storageSnapshot.providerFileId,
        provider_revision_id: storageSnapshot.providerRevisionId,
        provider_mime_type: storageSnapshot.providerMimeType,
        provider_size_bytes: storageSnapshot.providerSizeBytes,
        provider_checksum: storageSnapshot.providerChecksum,
        submission_snapshot_at: storageSnapshot.snapshotAt,
        content: input.content || null,
        submitted_at: effectiveSubmittedAt.toISOString(),
        client_submitted_at: clientSubmittedAt ? clientSubmittedAt.toISOString() : null,
        submitted_after_close: submittedAfterClose,
        status: targetStatus,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update submission', { error: error.message });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update submission', 500);
    }

    if (input.sync_key) {
      await recordSubmissionSyncEvent(input.sync_key, userId, assignmentId, data.id);
    }

    if (currentStatus !== targetStatus) {
      await recordSubmissionStatusHistory(
        data.id,
        currentStatus,
        targetStatus,
        userId,
        'Student submitted revision',
        {
          action: 'resubmit',
          assignment_id: assignmentId,
        }
      );

      await notifyStandingUpdated(assignment.course_id, userId, {
        source: 'submission_resubmitted',
        assignmentId: assignmentId,
        submissionId: data.id,
        status: targetStatus,
      });
    }

    // Log resubmission audit event
    await auditService.logAssignmentEvent(
      userId,
      AuditEventType.ASSIGNMENT_RESUBMITTED,
      assignmentId,
      {
        submission_id: data.id,
        assignment_title: assignment.title,
        is_late: isLate,
        storage_provider: storageSnapshot.storageProvider,
        provider_file_id: storageSnapshot.providerFileId,
      }
    );

    notifySubmissionReceived(assignment.course.teacher.id, {
      assignmentId: assignmentId,
      assignmentTitle: assignment.title,
      studentName,
      submittedAt: new Date().toISOString(),
    });

    return normalizeSubmissionRowForRead(
      data,
      {
        source: 'submit_assignment_update',
        assignmentId,
      }
    );
  }

  // Create new submission
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .insert({
      assignment_id: assignmentId,
      student_id: userId,
      drive_file_id: storageSnapshot.legacyDriveFileId,
      drive_file_name: storageSnapshot.legacyDriveFileName,
      drive_view_link: storageSnapshot.legacyDriveViewLink,
      storage_provider: storageSnapshot.storageProvider,
      provider_file_id: storageSnapshot.providerFileId,
      provider_revision_id: storageSnapshot.providerRevisionId,
      provider_mime_type: storageSnapshot.providerMimeType,
      provider_size_bytes: storageSnapshot.providerSizeBytes,
      provider_checksum: storageSnapshot.providerChecksum,
      submission_snapshot_at: storageSnapshot.snapshotAt,
      content: input.content || null,
      submitted_at: effectiveSubmittedAt.toISOString(),
      client_submitted_at: clientSubmittedAt ? clientSubmittedAt.toISOString() : null,
      submitted_after_close: submittedAfterClose,
      status: targetStatus,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create submission', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to submit assignment', 500);
  }

  if (input.sync_key) {
    await recordSubmissionSyncEvent(input.sync_key, userId, assignmentId, data.id);
  }

  await recordSubmissionStatusHistory(
    data.id,
    null,
    targetStatus,
    userId,
    'Initial submission',
    {
      action: 'initial_submit',
      assignment_id: assignmentId,
    }
  );

  await notifyStandingUpdated(assignment.course_id, userId, {
    source: 'submission_created',
    assignmentId: assignmentId,
    submissionId: data.id,
    status: targetStatus,
  });

  // Log submission audit event
  await auditService.logAssignmentEvent(
    userId,
    AuditEventType.ASSIGNMENT_SUBMITTED,
    assignmentId,
    {
      submission_id: data.id,
      assignment_title: assignment.title,
      is_late: isLate,
      storage_provider: storageSnapshot.storageProvider,
      provider_file_id: storageSnapshot.providerFileId,
    }
  );

  notifySubmissionReceived(assignment.course.teacher.id, {
    assignmentId: assignmentId,
    assignmentTitle: assignment.title,
    studentName,
    submittedAt: new Date().toISOString(),
  });

  return normalizeSubmissionRowForRead(
    data,
    {
      source: 'submit_assignment_insert',
      assignmentId,
    }
  );
};

/**
 * Get submission by ID
 */
export const getSubmissionById = async (
  submissionId: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionWithStudent> => {
  const submission = await getSubmissionWithAccessContext(submissionId);
  assertSubmissionAccess(submission, userId, userRole);
  return toSubmissionWithStudent(submission);
};

/**
 * Transition submission status with role-aware transition rules.
 */
export const transitionSubmissionStatus = async (
  submissionId: string,
  input: TransitionSubmissionStatusInput,
  userId: string,
  userRole: UserRole
): Promise<SubmissionWithStudent> => {
  const submission = await getSubmissionWithAccessContext(submissionId);
  assertSubmissionAccess(submission, userId, userRole);

  const currentStatus = parseSubmissionStatus(submission.status);
  const targetStatus = parseSubmissionStatus(input.status);

  if (currentStatus === targetStatus) {
    return toSubmissionWithStudent(submission);
  }

  const allowedTargets = SUBMISSION_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTargets.includes(targetStatus)) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid status transition from ${currentStatus} to ${targetStatus}`,
      400
    );
  }

  assertTransitionAllowedForRole(submission, currentStatus, targetStatus, userId, userRole);

  if (
    currentStatus === SubmissionStatus.UNDER_REVIEW &&
    targetStatus === SubmissionStatus.DRAFT &&
    !input.reason?.trim()
  ) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Revision reason is required when returning a submission to draft',
      400
    );
  }

  if (targetStatus === SubmissionStatus.GRADED) {
    const { data: existingGrade, error: gradeLookupError } = await supabaseAdmin
      .from('grades')
      .select('id')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (gradeLookupError) {
      logger.error('Failed to validate grade before submission status transition', {
        submissionId,
        targetStatus,
        error: gradeLookupError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate submission grade state', 500);
    }

    if (!existingGrade) {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot mark submission as graded without an associated grade record',
        400
      );
    }
  }

  const updatePayload: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === SubmissionStatus.SUBMITTED || targetStatus === SubmissionStatus.LATE) {
    updatePayload.submitted_at = new Date().toISOString();
  }

  const { error: updateError } = await supabaseAdmin
    .from('submissions')
    .update(updatePayload)
    .eq('id', submissionId);

  if (updateError) {
    logger.error('Failed to transition submission status', {
      submissionId,
      currentStatus,
      targetStatus,
      userId,
      error: updateError.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update submission status', 500);
  }

  await recordSubmissionStatusHistory(
    submissionId,
    currentStatus,
    targetStatus,
    userId,
    input.reason,
    {
      actor_role: userRole,
    }
  );

  await auditService.logAuditEvent({
    user_id: userId,
    event_type: 'submission_status_changed',
    resource_type: 'submission',
    resource_id: submissionId,
    details: {
      assignment_id: submission.assignment.id,
      from_status: currentStatus,
      to_status: targetStatus,
      reason: input.reason || null,
      timestamp: new Date().toISOString(),
    },
  });

  await notifyStandingUpdated(submission.assignment.course_id, submission.student_id, {
    source: 'submission_status_transition',
    assignmentId: submission.assignment.id,
    submissionId,
    status: targetStatus,
  });

  return getSubmissionById(submissionId, userId, userRole);
};

/**
 * Request a revision by transitioning a submission from under review to draft.
 */
export const requestSubmissionRevision = async (
  submissionId: string,
  reason: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionWithStudent> => {
  return transitionSubmissionStatus(
    submissionId,
    {
      status: SubmissionStatus.DRAFT,
      reason,
    },
    userId,
    userRole
  );
};

/**
 * Get immutable status timeline for a submission.
 */
export const getSubmissionStatusTimeline = async (
  submissionId: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionStatusHistoryEntry[]> => {
  const submission = await getSubmissionWithAccessContext(submissionId);
  assertSubmissionAccess(submission, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('submission_status_history')
    .select(`
      id, submission_id, from_status, to_status, changed_by, reason, metadata, created_at,
      actor:profiles!submission_status_history_changed_by_fkey(id, email, first_name, last_name, role)
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingRelationError(error)) {
      logger.warn('submission_status_history table missing; returning empty timeline', {
        submissionId,
      });
      return [];
    }

    logger.error('Failed to load submission status timeline', {
      submissionId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load submission timeline', 500);
  }

  return (data || []).map(fixStatusActorJoin);
};

/**
 * List submissions for an assignment (teacher view)
 */
export const listSubmissions = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionWithGrade[]> => {
  const assignment = await getAssignmentById(assignmentId);

  // Only teacher of the course or admin can view all submissions
  if (userRole !== UserRole.ADMIN && assignment.course.teacher.id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view submissions for your own courses',
      403
    );
  }

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select(`
      *,
      student:profiles!submissions_student_id_fkey(id, email, first_name, last_name),
      assignment:assignments(*),
      grade:grades(id, points_earned, feedback, graded_by, graded_at)
    `)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });

  if (error) {
    logger.error('Failed to list submissions', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list submissions', 500);
  }

  const normalizedSubmissions = (data || []).map((submission: any) => {
    const normalizedSubmission = normalizeSubmissionRowForRead(
      submission,
      {
        source: 'list_submissions',
        assignmentId,
      },
      { logIssues: false }
    );
    const grade = Array.isArray(submission.grade) ? submission.grade[0] || null : submission.grade;
    const assignmentRecord = Array.isArray(submission.assignment)
      ? submission.assignment[0] || null
      : submission.assignment;

    return {
      ...normalizedSubmission,
      assignment: assignmentRecord
        ? {
            ...assignmentRecord,
            assignment_type: normalizeAssignmentType(assignmentRecord.assignment_type),
          }
        : assignmentRecord,
      grade,
    };
  }) as SubmissionWithGrade[];

  const issueBreakdown = summarizeSubmissionStorageConsistencyIssues(normalizedSubmissions);
  const inconsistentSubmissions = normalizedSubmissions.filter(
    (submission) => (submission.storage_consistency_issues || []).length > 0
  ).length;

  if (inconsistentSubmissions > 0) {
    logger.warn('Submission storage consistency issues detected in assignment listing', {
      assignmentId,
      inconsistentSubmissions,
      totalSubmissions: normalizedSubmissions.length,
      issueBreakdown,
    });
  }

  return normalizedSubmissions;
};

/**
 * Get student's own submission
 */
export const getMySubmission = async (
  assignmentId: string,
  userId: string
): Promise<Submission | null> => {
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to get submission', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get submission', 500);
  }

  if (!data) {
    return null;
  }

  return normalizeSubmissionRowForRead(
    data,
    {
      source: 'get_my_submission',
      assignmentId,
    }
  );
};

export const getAssignmentSubmissionStorageDiagnostics = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionStorageDiagnosticsReport> => {
  const assignment = await getAssignmentById(assignmentId);

  if (userRole !== UserRole.ADMIN && assignment.course.teacher.id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view submission diagnostics for your own courses',
      403
    );
  }

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select(`
      id,
      assignment_id,
      student_id,
      submitted_at,
      status,
      drive_file_id,
      drive_file_name,
      drive_view_link,
      storage_provider,
      provider_file_id,
      provider_revision_id,
      provider_mime_type,
      provider_size_bytes,
      provider_checksum,
      submission_snapshot_at
    `)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });

  if (error) {
    logger.error('Failed to load submission storage diagnostics', {
      assignmentId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load submission diagnostics', 500);
  }

  const normalizedSubmissions = (data || []).map((submission: any) => {
    return normalizeSubmissionRowForRead(
      submission,
      {
        source: 'submission_storage_diagnostics',
        assignmentId,
      },
      { logIssues: false }
    );
  });

  const diagnosticsEntries: SubmissionStorageDiagnosticEntry[] = normalizedSubmissions.map((submission) => ({
    submission_id: submission.id,
    student_id: submission.student_id,
    status: submission.status,
    submitted_at: submission.submitted_at,
    storage_provider: submission.storage_provider,
    provider_file_id: submission.provider_file_id,
    submission_snapshot_at: submission.submission_snapshot_at,
    issues: submission.storage_consistency_issues || [],
  }));

  const issueBreakdown = summarizeSubmissionStorageConsistencyIssues(normalizedSubmissions);
  const inconsistentSubmissions = diagnosticsEntries.filter((entry) => entry.issues.length > 0).length;

  const report: SubmissionStorageDiagnosticsReport = {
    assignment_id: assignmentId,
    total_submissions: diagnosticsEntries.length,
    consistent_submissions: diagnosticsEntries.length - inconsistentSubmissions,
    inconsistent_submissions: inconsistentSubmissions,
    issue_breakdown: issueBreakdown,
    submissions: diagnosticsEntries,
  };

  if (inconsistentSubmissions > 0) {
    logger.warn('Submission storage diagnostics found inconsistent metadata rows', {
      assignmentId,
      inconsistentSubmissions,
      totalSubmissions: diagnosticsEntries.length,
      issueBreakdown,
    });
  }

  await auditService.logAssignmentEvent(
    userId,
    AuditEventType.ASSIGNMENT_SUBMISSION_STORAGE_DIAGNOSTICS_VIEWED,
    assignmentId,
    {
      total_submissions: report.total_submissions,
      inconsistent_submissions: report.inconsistent_submissions,
      issue_breakdown: report.issue_breakdown,
    }
  );

  return report;
};

const ensureAssignmentCommentAccess = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<AssignmentWithCourse> => {
  const assignment = await getAssignmentById(assignmentId);

  if (userRole === UserRole.ADMIN) {
    return assignment;
  }

  if (assignment.course.teacher.id === userId) {
    return assignment;
  }

  if (userRole === UserRole.STUDENT) {
    const { data: enrollmentRows, error } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('course_id', assignment.course_id)
      .eq('student_id', userId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES)
      .limit(1);

    if (error) {
      logger.error('Failed to verify enrollment for assignment comments', {
        assignmentId,
        userId,
        error: error.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate assignment access', 500);
    }

    if (Array.isArray(enrollmentRows) && enrollmentRows.length > 0) {
      return assignment;
    }
  }

  throw new ApiError(
    ErrorCode.FORBIDDEN,
    'You do not have access to comments for this assignment',
    403
  );
};

export const listAssignmentComments = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<AssignmentCommentWithAuthor[]> => {
  await ensureAssignmentCommentAccess(assignmentId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('assignment_comments')
    .select(`
      id, assignment_id, author_id, content, created_at, updated_at,
      author:profiles!assignment_comments_author_id_fkey(id, email, first_name, last_name, role)
    `)
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to list assignment comments', { assignmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load assignment comments', 500);
  }

  return (data || []).map(fixCommentAuthorJoin);
};

export const createAssignmentComment = async (
  assignmentId: string,
  input: CreateAssignmentCommentInput,
  userId: string,
  userRole: UserRole
): Promise<AssignmentCommentWithAuthor> => {
  await ensureAssignmentCommentAccess(assignmentId, userId, userRole);

  const { data, error } = await supabaseAdmin
    .from('assignment_comments')
    .insert({
      assignment_id: assignmentId,
      author_id: userId,
      content: input.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(`
      id, assignment_id, author_id, content, created_at, updated_at,
      author:profiles!assignment_comments_author_id_fkey(id, email, first_name, last_name, role)
    `)
    .single();

  if (error || !data) {
    logger.error('Failed to create assignment comment', {
      assignmentId,
      userId,
      error: error?.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create assignment comment', 500);
  }

  return fixCommentAuthorJoin(data);
};
