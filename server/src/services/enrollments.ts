import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  Enrollment,
  EnrollmentStatus,
  EnrollmentWithCourse,
  EnrollmentWithStudent,
  EnrollmentQuery,
  UpdateEnrollmentStatusInput,
} from '../types/enrollments.js';
import { CourseStatus } from '../types/courses.js';
import { sendEnrollmentNotification } from './notifications.js';
import logger from '../utils/logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_CLASS_CODE_REGEX = /^[0-9a-f]{8}$/i;
const LEGACY_ACTIVE_ENROLLMENT_STATUS = 'enrolled';
const ACTIVE_ENROLLMENT_STATUSES = [
  EnrollmentStatus.ACTIVE,
  LEGACY_ACTIVE_ENROLLMENT_STATUS,
];

const normalizeDbErrorText = (error: { message?: string; details?: string; hint?: string } | null): string => {
  if (!error) {
    return '';
  }

  return [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
};

const isMissingColumnError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
  column: string
): boolean => {
  if (!error) {
    return false;
  }

  return error.code === '42703' && normalizeDbErrorText(error).includes(column.toLowerCase());
};

const isStatusCompatibilityError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null
): boolean => {
  if (!error) {
    return false;
  }

  const text = normalizeDbErrorText(error);

  return (
    ((error.code === '23514' || error.code === '22P02') && text.includes('status')) ||
    (text.includes('invalid input value for enum') && text.includes('status')) ||
    (text.includes('status') && text.includes('check constraint'))
  );
};

const isActiveEnrollmentStatus = (status: unknown): boolean => {
  const normalizedStatus = String(status || '').toLowerCase();
  return ACTIVE_ENROLLMENT_STATUSES.includes(normalizedStatus as EnrollmentStatus | string);
};

const buildEnrollmentMutationPayload = (
  status: string,
  includeEnrolledAt: boolean
): { status: string; enrolled_at?: string } => {
  return includeEnrolledAt
    ? {
        status,
        enrolled_at: new Date().toISOString(),
      }
    : {
        status,
      };
};

const insertEnrollmentWithCompatibility = async (
  courseId: string,
  studentId: string
): Promise<{ data: Enrollment | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }> => {
  const primaryInsertPayload = {
    course_id: courseId,
    student_id: studentId,
    ...buildEnrollmentMutationPayload(EnrollmentStatus.ACTIVE, true),
  };

  const { data: primaryData, error: primaryError } = await supabaseAdmin
    .from('enrollments')
    .insert(primaryInsertPayload)
    .select()
    .single();

  if (!primaryError) {
    return { data: primaryData as Enrollment, error: null };
  }

  const fallbackStatus = isStatusCompatibilityError(primaryError)
    ? LEGACY_ACTIVE_ENROLLMENT_STATUS
    : EnrollmentStatus.ACTIVE;
  const includeEnrolledAt = !isMissingColumnError(primaryError, 'enrolled_at');

  if (fallbackStatus === EnrollmentStatus.ACTIVE && includeEnrolledAt) {
    return { data: null, error: primaryError };
  }

  logger.warn('Retrying enrollment insert with compatibility fallback', {
    courseId,
    studentId,
    fallbackStatus,
    includeEnrolledAt,
    initialErrorCode: primaryError.code,
    initialErrorMessage: primaryError.message,
  });

  const retryPayload = {
    course_id: courseId,
    student_id: studentId,
    ...buildEnrollmentMutationPayload(fallbackStatus, includeEnrolledAt),
  };

  const { data: retryData, error: retryError } = await supabaseAdmin
    .from('enrollments')
    .insert(retryPayload)
    .select()
    .single();

  if (!retryError) {
    return { data: retryData as Enrollment, error: null };
  }

  return { data: null, error: retryError };
};

const reactivateEnrollmentWithCompatibility = async (
  courseId: string,
  studentId: string,
  preferLegacyStatus: boolean
): Promise<{ data: Enrollment[] | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }> => {
  const primaryStatus = preferLegacyStatus
    ? LEGACY_ACTIVE_ENROLLMENT_STATUS
    : EnrollmentStatus.ACTIVE;

  const primaryUpdatePayload = buildEnrollmentMutationPayload(primaryStatus, true);

  const { data: primaryData, error: primaryError } = await supabaseAdmin
    .from('enrollments')
    .update(primaryUpdatePayload)
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .select();

  if (!primaryError) {
    return { data: (primaryData || []) as Enrollment[], error: null };
  }

  const fallbackStatus = isStatusCompatibilityError(primaryError)
    ? LEGACY_ACTIVE_ENROLLMENT_STATUS
    : primaryStatus;
  const includeEnrolledAt = !isMissingColumnError(primaryError, 'enrolled_at');

  if (fallbackStatus === primaryStatus && includeEnrolledAt) {
    return { data: null, error: primaryError };
  }

  logger.warn('Retrying enrollment reactivation with compatibility fallback', {
    courseId,
    studentId,
    fallbackStatus,
    includeEnrolledAt,
    initialErrorCode: primaryError.code,
    initialErrorMessage: primaryError.message,
  });

  const retryUpdatePayload = buildEnrollmentMutationPayload(fallbackStatus, includeEnrolledAt);

  const { data: retryData, error: retryError } = await supabaseAdmin
    .from('enrollments')
    .update(retryUpdatePayload)
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .select();

  if (!retryError) {
    return { data: (retryData || []) as Enrollment[], error: null };
  }

  return { data: null, error: retryError };
};

const resolveCourseIdFromReference = async (courseReference: string): Promise<string> => {
  const normalizedReference = courseReference.trim().toLowerCase();

  if (UUID_REGEX.test(normalizedReference)) {
    return normalizedReference;
  }

  if (!SHORT_CLASS_CODE_REGEX.test(normalizedReference)) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invalid class code format', 400);
  }

  const pageSize = 1000;
  let offset = 0;
  const matches: string[] = [];

  while (offset <= 10000 && matches.length < 2) {
    const { data: courses, error } = await supabaseAdmin
      .from('courses')
      .select('id')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to resolve class code', {
        classCode: normalizedReference,
        error: error.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to resolve class code', 500);
    }

    const rows = courses || [];
    for (const course of rows) {
      if (String(course.id || '').toLowerCase().startsWith(normalizedReference)) {
        matches.push(String(course.id));
      }
    }

    if (rows.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  if (matches.length === 0) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  if (matches.length > 1) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Class code is ambiguous. Please use the full course ID.',
      400
    );
  }

  return matches[0];
};

// Helper to fix nested Supabase join arrays
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixCourseJoin = (data: any): EnrollmentWithCourse => {
  if (!data) return data;
  const course = Array.isArray(data.course) ? data.course[0] : data.course;
  return {
    ...data,
    course: course ? {
      ...course,
      teacher: Array.isArray(course.teacher) ? course.teacher[0] || null : course.teacher
    } : null
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixStudentJoin = (data: any): EnrollmentWithStudent => {
  if (!data) return data;
  return {
    ...data,
    student: Array.isArray(data.student) ? data.student[0] || null : data.student
  };
};

/**
 * Enroll a student in a course
 */
export const enrollStudent = async (
  courseReference: string,
  studentId: string,
  options?: {
    allowNonPublished?: boolean;
  }
): Promise<Enrollment> => {
  const courseId = await resolveCourseIdFromReference(courseReference);

  // Check if course exists and is published
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, status, title, teacher_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  const normalizedCourseStatus = String(course.status || CourseStatus.PUBLISHED).toLowerCase();
  const isJoinableStatus =
    normalizedCourseStatus === CourseStatus.PUBLISHED ||
    normalizedCourseStatus === CourseStatus.DRAFT;

  if (!isJoinableStatus && !options?.allowNonPublished) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'This class is archived and cannot accept new enrollments',
      400
    );
  }

  // Check if student exists and has student role
  const { data: student, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('id', studentId)
    .single();

  if (studentError || !student) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Student not found', 404);
  }

  if (student.role !== UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Only students can enroll in courses',
      400
    );
  }

  let enrollmentActor:
    | {
        id: string;
        name?: string;
        avatar_url?: string | null;
      }
    | undefined;

  if (course.teacher_id) {
    const { data: teacherProfile, error: teacherProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url')
      .eq('id', course.teacher_id)
      .maybeSingle();

    if (teacherProfileError) {
      logger.warn('Failed to resolve enrollment notification actor profile', {
        courseId,
        studentId,
        teacherId: course.teacher_id,
        error: teacherProfileError.message,
      });
    } else if (teacherProfile?.id) {
      const firstName = teacherProfile.first_name?.trim() || '';
      const lastName = teacherProfile.last_name?.trim() || '';
      const displayName = `${firstName} ${lastName}`.trim() || teacherProfile.email || 'Instructor';

      enrollmentActor = {
        id: teacherProfile.id,
        name: displayName,
        avatar_url: teacherProfile.avatar_url || null,
      };
    }
  }

  // Check for existing enrollment records (including inactive duplicates)
  const { data: existingEnrollments, error: existingEnrollmentError } = await supabaseAdmin
    .from('enrollments')
    .select('id, status')
    .eq('course_id', courseId)
    .eq('student_id', studentId);

  if (existingEnrollmentError) {
    logger.error('Failed to check existing enrollment records', {
      courseId,
      studentId,
      error: existingEnrollmentError.message,
    });
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'Failed to check existing enrollment records',
      500,
      {
        reason: 'ENROLLMENT_LOOKUP_FAILED',
        db_code: existingEnrollmentError.code,
        db_message: existingEnrollmentError.message,
      }
    );
  }

  const enrollmentRows = existingEnrollments || [];
  const activeEnrollment = enrollmentRows.find(
    (enrollment) => isActiveEnrollmentStatus(enrollment.status)
  );

  if (activeEnrollment) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Already enrolled in this course',
      400,
      {
        reason: 'ALREADY_ENROLLED',
        enrollment_id: activeEnrollment.id,
      }
    );
  }

  if (enrollmentRows.length > 0) {
    // Re-activate any existing enrollment rows for this student in this course.
    const preferLegacyStatus = enrollmentRows.some(
      (enrollment) => String(enrollment.status || '').toLowerCase() === LEGACY_ACTIVE_ENROLLMENT_STATUS
    );

    const {
      data: reactivatedRows,
      error: reactivationError,
    } = await reactivateEnrollmentWithCompatibility(courseId, studentId, preferLegacyStatus);

    if (reactivationError) {
      logger.error('Failed to reactivate enrollment', {
        courseId,
        studentId,
        error: reactivationError.message,
      });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to reactivate existing enrollment', 500, {
        reason: 'ENROLLMENT_REACTIVATE_FAILED',
        db_code: reactivationError.code,
        db_message: reactivationError.message,
      });
    }

    const reactivated = (reactivatedRows || [])[0] || enrollmentRows[0];

    try {
      await sendEnrollmentNotification(studentId, course.title || 'Course', courseId, enrollmentActor);
    } catch (notificationError) {
      logger.warn('Enrollment notification failed after re-enrollment', {
        courseId,
        studentId,
        error:
          notificationError instanceof Error
            ? notificationError.message
            : String(notificationError),
      });
    }

    return reactivated as Enrollment;
  }

  // Create new enrollment
  const { data, error } = await insertEnrollmentWithCompatibility(courseId, studentId);

  if (error) {
    logger.error('Failed to enroll student', { courseId, studentId, error: error.message });

    if (error.code === '23505') {
      throw new ApiError(ErrorCode.CONFLICT, 'Enrollment record already exists for this student', 409, {
        reason: 'ENROLLMENT_DUPLICATE_RECORD',
        db_code: error.code,
        db_message: error.message,
      });
    }

    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to enroll in course', 500, {
      reason: 'ENROLLMENT_INSERT_FAILED',
      db_code: error.code,
      db_message: error.message,
    });
  }

  try {
    await sendEnrollmentNotification(studentId, course.title || 'Course', courseId, enrollmentActor);
  } catch (notificationError) {
    logger.warn('Enrollment notification failed after new enrollment', {
      courseId,
      studentId,
      error:
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError),
    });
  }

  return data as Enrollment;
};

/**
 * Get student's enrolled courses
 */
export const getStudentEnrollments = async (
  studentId: string,
  query: EnrollmentQuery
): Promise<{ enrollments: EnrollmentWithCourse[]; total: number }> => {
  let queryBuilder = supabaseAdmin
    .from('enrollments')
    .select(`
      id, course_id, student_id, enrolled_at, status,
      course:courses(
        id, title, description, status,
        teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
      )
    `, { count: 'exact' })
    .eq('student_id', studentId);

  if (query.status) {
    queryBuilder =
      query.status === EnrollmentStatus.ACTIVE
        ? queryBuilder.in('status', ACTIVE_ENROLLMENT_STATUSES)
        : queryBuilder.eq('status', query.status);
  }

  const { data, error, count } = await queryBuilder
    .order('enrolled_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to get student enrollments', { studentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get enrollments', 500);
  }

  return {
    enrollments: (data || []).map(fixCourseJoin),
    total: count || 0,
  };
};

/**
 * Get course roster (students enrolled in a course)
 */
export const getCourseRoster = async (
  courseId: string,
  userId: string,
  userRole: string,
  query: EnrollmentQuery
): Promise<{ enrollments: EnrollmentWithStudent[]; total: number }> => {
  // Verify course exists and user has access
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id')
    .eq('id', courseId)
    .single();

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  // Only admin or course teacher can view roster
  if (userRole !== 'admin' && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only view rosters for your own courses',
      403
    );
  }

  let queryBuilder = supabaseAdmin
    .from('enrollments')
    .select(`
      id, course_id, student_id, enrolled_at, status,
      student:profiles!enrollments_student_id_fkey(id, email, first_name, last_name)
    `, { count: 'exact' })
    .eq('course_id', courseId);

  if (query.status) {
    queryBuilder =
      query.status === EnrollmentStatus.ACTIVE
        ? queryBuilder.in('status', ACTIVE_ENROLLMENT_STATUSES)
        : queryBuilder.eq('status', query.status);
  }

  const { data, error, count } = await queryBuilder
    .order('enrolled_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to get course roster', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to get roster', 500);
  }

  return {
    enrollments: (data || []).map(fixStudentJoin),
    total: count || 0,
  };
};

/**
 * Get enrollment by ID
 */
export const getEnrollmentById = async (enrollmentId: string): Promise<EnrollmentWithCourse> => {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select(`
      id, course_id, student_id, enrolled_at, status,
      course:courses(
        id, title, description, status,
        teacher:profiles!courses_teacher_id_fkey(id, email, first_name, last_name)
      )
    `)
    .eq('id', enrollmentId)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Enrollment not found', 404);
  }

  return fixCourseJoin(data);
};

/**
 * Update enrollment status (drop, complete)
 */
export const updateEnrollmentStatus = async (
  enrollmentId: string,
  input: UpdateEnrollmentStatusInput,
  userId: string,
  userRole: string
): Promise<Enrollment> => {
  const enrollment = await getEnrollmentById(enrollmentId);

  // Students can only drop their own enrollments
  // Teachers can mark students as completed
  // Admins can do anything
  if (userRole === 'student') {
    if (enrollment.student_id !== userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Cannot modify another student\'s enrollment', 403);
    }
    if (input.status !== EnrollmentStatus.DROPPED) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'Students can only drop courses',
        403
      );
    }
  } else if (userRole === 'teacher') {
    if (enrollment.course?.teacher?.id !== userId) {
      throw new ApiError(
        ErrorCode.FORBIDDEN,
        'You can only modify enrollments in your own courses',
        403
      );
    }
  }

  // Validate status transitions
  const validTransitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
    [EnrollmentStatus.ACTIVE]: [EnrollmentStatus.DROPPED, EnrollmentStatus.COMPLETED],
    [EnrollmentStatus.DROPPED]: [EnrollmentStatus.ACTIVE],
    [EnrollmentStatus.COMPLETED]: [], // Completed is final
  };

  const currentStatus = enrollment.status as EnrollmentStatus;
  const normalizedCurrentStatus = isActiveEnrollmentStatus(currentStatus)
    ? EnrollmentStatus.ACTIVE
    : currentStatus;

  if (!validTransitions[normalizedCurrentStatus]?.includes(input.status)) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      `Cannot change status from ${normalizedCurrentStatus} to ${input.status}`,
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .update({ status: input.status })
    .eq('id', enrollmentId)
    .select()
    .single();

  if (error) {
    logger.error('Failed to update enrollment', { enrollmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update enrollment', 500);
  }

  return data as Enrollment;
};

/**
 * Unenroll (delete) an enrollment
 */
export const unenrollStudent = async (
  enrollmentId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  const enrollment = await getEnrollmentById(enrollmentId);

  // Only the enrolled student or admin can unenroll
  if (userRole !== UserRole.ADMIN && enrollment.student_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only unenroll yourself from courses',
      403
    );
  }

  const { error } = await supabaseAdmin
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId);

  if (error) {
    logger.error('Failed to unenroll student', { enrollmentId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to unenroll from course', 500);
  }
};

/**
 * Check if a student is enrolled in a course
 */
export const isStudentEnrolled = async (
  courseId: string,
  studentId: string
): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)
    .limit(1);

  if (error) {
    logger.warn('Failed to check active enrollment state', {
      courseId,
      studentId,
      error: error.message,
    });
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

/**
 * Get enrollment status for a user in a course
 */
export const getEnrollmentStatusForUser = async (
  courseId: string,
  userId: string
): Promise<{ enrolled: boolean; status: string | null; enrollment_id: string | null }> => {
  const { data, error } = await supabaseAdmin
    .from('enrollments')
    .select('id, status')
    .eq('course_id', courseId)
    .eq('student_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Failed to check enrollment status', { courseId, userId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to check enrollment status', 500);
  }

  if (!data) {
    return { enrolled: false, status: null, enrollment_id: null };
  }

  return {
    enrolled: isActiveEnrollmentStatus(data.status),
    status: data.status,
    enrollment_id: data.id,
  };
};
