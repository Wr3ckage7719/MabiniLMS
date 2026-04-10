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
  CreateSubmissionInput,
  SubmissionStatus,
} from '../types/assignments.js';
import * as driveService from './google-drive.js';
import * as auditService from './audit.js';
import { AuditEventType } from './audit.js';
import { notifyAssignmentCreated, notifySubmissionReceived } from './websocket.js';
import logger from '../utils/logger.js';

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

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .insert({
      course_id: courseId,
      title: input.title,
      description: input.description || null,
      due_date: input.due_date || null,
      max_points: input.max_points || 100,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create assignment', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create assignment', 500);
  }

  await notifyAssignmentCreated(courseId, {
    id: data.id,
    title: data.title,
    courseName: course.title || 'Course',
    dueDate: data.due_date || '',
  });

  return data as Assignment;
};

/**
 * Get assignment by ID
 */
export const getAssignmentById = async (assignmentId: string): Promise<AssignmentWithCourse> => {
  const { data, error } = await supabaseAdmin
    .from('assignments')
    .select(`
      id, course_id, title, description, due_date, max_points, created_at,
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
    ...rawData,
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
      id, course_id, title, description, due_date, max_points, created_at,
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
        .eq('status', 'active');

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
      ...item,
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

  const { data, error } = await supabaseAdmin
    .from('assignments')
    .update(input)
    .eq('id', assignmentId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update assignment', { assignmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update assignment', 500);
  }

  return data as Assignment;
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
    .eq('status', 'active')
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
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId)
    .single();

  if (existing) {
    // Update existing submission
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({
        drive_file_id: input.drive_file_id,
        drive_file_name: input.drive_file_name || fileMetadata.name,
        drive_view_link: driveService.getDriveWebViewUrl(input.drive_file_id),
        content: input.content || null,
        submitted_at: new Date().toISOString(),
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
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
      status: isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED,
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
export const getSubmissionById = async (submissionId: string): Promise<SubmissionWithStudent> => {
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select(`
      *,
      student:profiles!submissions_student_id_fkey(id, email, first_name, last_name),
      assignment:assignments(id, title, max_points)
    `)
    .eq('id', submissionId)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Submission not found', 404);
  }

  return data as SubmissionWithStudent;
};

/**
 * List submissions for an assignment (teacher view)
 */
export const listSubmissions = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<SubmissionWithStudent[]> => {
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
      assignment:assignments(id, title, max_points)
    `)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });

  if (error) {
    logger.error('Failed to list submissions', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to list submissions', 500);
  }

  return data as SubmissionWithStudent[];
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
      .eq('status', 'active')
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
