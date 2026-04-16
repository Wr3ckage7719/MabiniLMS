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
  SubmissionStatusHistoryEntry,
  CreateSubmissionInput,
  TransitionSubmissionStatusInput,
  SubmissionStatus,
} from '../types/assignments.js';
import * as driveService from './google-drive.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import { sendAssignmentCreatedNotification } from './notifications.js';
import { notifyAssignmentCreated, notifyStandingUpdated, notifySubmissionReceived } from './websocket.js';
import logger from '../utils/logger.js';
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js';
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixCommentAuthorJoin = (comment: any): AssignmentCommentWithAuthor => {
  const author = Array.isArray(comment.author) ? comment.author[0] || null : comment.author;
  return {
    ...comment,
    author,
  } as AssignmentCommentWithAuthor;
};

const isMissingRelationError = (
  error?: { code?: string; message?: string } | null
): boolean => {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
};

const isMissingColumnError = (
  error: { message?: string } | null | undefined,
  columnName: string
): boolean => {
  const message = (error?.message || '').toLowerCase();
  return (
    message.includes('column') &&
    message.includes(columnName.toLowerCase()) &&
    message.includes('does not exist')
  );
};

const isMissingProctoringColumnError = (
  error: { message?: string } | null | undefined
): boolean => {
  return (
    isMissingColumnError(error, 'is_proctored') ||
    isMissingColumnError(error, 'exam_duration_minutes') ||
    isMissingColumnError(error, 'proctoring_policy')
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeAssignmentRecord = (assignment: any): any => {
  if (!assignment || typeof assignment !== 'object') {
    return assignment;
  }

  return {
    ...assignment,
    assignment_type: normalizeAssignmentType(assignment.assignment_type),
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

  return submission as Submission;
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
const normalizeSubmissionContext = (record: any): SubmissionWithAccessContext => {
  const assignment = Array.isArray(record.assignment) ? record.assignment[0] || null : record.assignment;
  const course = assignment?.course
    ? (Array.isArray(assignment.course) ? assignment.course[0] || null : assignment.course)
    : null;
  const student = Array.isArray(record.student) ? record.student[0] || null : record.student;

  return {
    ...record,
    status: parseSubmissionStatus(record.status),
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
      id, assignment_id, student_id, content, file_url, drive_file_id, drive_view_link, drive_file_name, submitted_at, status,
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

  const assignmentType = input.assignment_type || 'activity';
  const isExamAssignment = assignmentType === 'exam';
  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn();

  const insertPayload: Record<string, unknown> = {
    course_id: courseId,
    title: input.title,
    description: input.description || null,
    due_date: input.due_date || null,
    max_points: input.max_points || 100,
    created_at: new Date().toISOString(),
  };

  if (hasAssignmentTypeColumn) {
    insertPayload.assignment_type = assignmentType;
  }

  if (isExamAssignment || typeof input.is_proctored === 'boolean') {
    insertPayload.is_proctored = input.is_proctored ?? isExamAssignment;
    insertPayload.exam_duration_minutes =
      input.exam_duration_minutes
      ?? (isExamAssignment ? 60 : null);
    insertPayload.proctoring_policy = input.proctoring_policy || {
      max_violations: 3,
      terminate_on_fullscreen_exit: false,
      block_clipboard: true,
      block_context_menu: true,
      block_print_shortcut: true,
    };
  }

  let { data, error } = await supabaseAdmin
    .from('assignments')
    .insert(insertPayload)
    .select()
    .single();

  if (error && isMissingProctoringColumnError(error)) {
    logger.warn('Assignment proctoring columns missing. Retrying create assignment without proctoring fields.', {
      courseId,
      assignmentType,
      error: error.message,
    });

    delete insertPayload.is_proctored;
    delete insertPayload.exam_duration_minutes;
    delete insertPayload.proctoring_policy;

    const fallbackInsert = await supabaseAdmin
      .from('assignments')
      .insert(insertPayload)
      .select()
      .single();

    data = fallbackInsert.data;
    error = fallbackInsert.error;
  }

  if (error) {
    logger.error('Failed to create assignment', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create assignment', 500);
  }

  await notifyAssignmentCreated(courseId, {
    id: data.id,
    title: data.title,
    courseId,
    courseName: course.title || 'Course',
    assignmentType,
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
        assignmentType,
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

  if (userRole !== UserRole.ADMIN && assignment.course.teacher.id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only update your own assignments',
      403
    );
  }

  const updatePayload: Record<string, unknown> = {
    ...input,
  };

  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn();
  if (!hasAssignmentTypeColumn) {
    delete updatePayload.assignment_type;
  }

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .update(updatePayload)
    .eq('id', assignmentId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update assignment', { assignmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update assignment', 500);
  }

  return normalizeAssignmentRecord(data) as Assignment;
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
 * Submit an assignment with Google Drive file
 */
export const submitAssignment = async (
  assignmentId: string,
  input: CreateSubmissionInput,
  userId: string
): Promise<Submission> => {
  // Get assignment and verify it exists
  const assignment = await getAssignmentById(assignmentId);

  // Check if student is enrolled in the course
  const { data: enrollment } = await supabaseAdmin
    .from('enrollments')
    .select('id, status')
    .eq('course_id', assignment.course_id)
    .eq('student_id', userId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .single();

  if (!enrollment) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You must be enrolled in the course to submit assignments',
      403
    );
  }

  if (input.sync_key) {
    const existingSyncedSubmission = await getSubmissionBySyncKey(input.sync_key, userId);
    if (existingSyncedSubmission) {
      return existingSyncedSubmission;
    }
  }

  // Verify file access
  const hasAccess = await driveService.checkFileAccess(input.drive_file_id, userId);
  if (!hasAccess) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'Unable to access the specified Drive file',
      403
    );
  }

  // Get file metadata
  const fileMetadata = await driveService.getFileMetadata(input.drive_file_id, userId);

  // Share file with teacher (grant read access)
  const teacherEmail = assignment.course.teacher.email;
  await driveService.shareFileWithUser(
    input.drive_file_id,
    teacherEmail,
    'reader',
    userId
  );

  // Determine if late
  const now = new Date();
  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
  const isLate = dueDate && now > dueDate;

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
        drive_file_id: input.drive_file_id,
        drive_file_name: input.drive_file_name || fileMetadata.name,
        drive_view_link: driveService.getDriveWebViewUrl(input.drive_file_id),
        content: input.content || null,
        submitted_at: new Date().toISOString(),
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
      }
    );

    notifySubmissionReceived(assignment.course.teacher.id, {
      assignmentId: assignmentId,
      assignmentTitle: assignment.title,
      studentName,
      submittedAt: new Date().toISOString(),
    });

    return data as Submission;
  }

  // Create new submission
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .insert({
      assignment_id: assignmentId,
      student_id: userId,
      drive_file_id: input.drive_file_id,
      drive_file_name: input.drive_file_name || fileMetadata.name,
      drive_view_link: driveService.getDriveWebViewUrl(input.drive_file_id),
      content: input.content || null,
      submitted_at: new Date().toISOString(),
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
    }
  );

  notifySubmissionReceived(assignment.course.teacher.id, {
    assignmentId: assignmentId,
    assignmentTitle: assignment.title,
    studentName,
    submittedAt: new Date().toISOString(),
  });

  return data as Submission;
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

  return (data || []).map((submission: any) => {
    const grade = Array.isArray(submission.grade) ? submission.grade[0] || null : submission.grade;
    const assignment = Array.isArray(submission.assignment)
      ? submission.assignment[0] || null
      : submission.assignment;

    return {
      ...submission,
      assignment: assignment
        ? {
            ...assignment,
            assignment_type: normalizeAssignmentType(assignment.assignment_type),
          }
        : assignment,
      grade,
    };
  }) as SubmissionWithGrade[];
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

  return data as Submission | null;
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
    const { data: enrollment, error } = await supabaseAdmin
      .from('enrollments')
      .select('id')
      .eq('course_id', assignment.course_id)
      .eq('student_id', userId)
      .in('status', ACTIVE_ENROLLMENT_STATUSES)
      .maybeSingle();

    if (error) {
      logger.error('Failed to verify enrollment for assignment comments', {
        assignmentId,
        userId,
        error: error.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to validate assignment access', 500);
    }

    if (enrollment) {
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
