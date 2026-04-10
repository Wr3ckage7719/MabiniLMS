import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode, UserRole } from '../types/index.js';
import {
  BulkDirectEnrollByEmailInput,
  BulkDirectEnrollmentResult,
  CreateInvitationInput,
  DirectEnrollByEmailInput,
  DirectEnrollmentResult,
  DirectEnrollmentStatus,
  Invitation,
  InvitationQuery,
  InvitationStatus,
  InvitationWithCourse,
} from '../types/invitations.js';
import * as enrollmentService from './enrollments.js';
import * as auditService from './audit.js';
import { ALLOWED_DOMAIN } from '../types/google-oauth.js';
import { sendEnrollmentNotification } from './notifications.js';
import logger from '../utils/logger.js';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const DIRECT_ENROLL_AUDIT_EVENT = 'course_enroll_by_email';

const isInstitutionalStudentEmail = (email: string): boolean => {
  return normalizeEmail(email).endsWith(`@${ALLOWED_DOMAIN}`);
};

const shouldCountAsFailure = (status: DirectEnrollmentStatus): boolean => {
  return status !== DirectEnrollmentStatus.ENROLLED && status !== DirectEnrollmentStatus.ALREADY_ENROLLED;
};

const syncPendingInvitationStatus = async (
  courseId: string,
  studentEmail: string,
  studentId: string
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('class_invitations')
    .update({
      status: InvitationStatus.ACCEPTED,
      student_id: studentId,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('course_id', courseId)
    .eq('student_email', studentEmail)
    .eq('status', InvitationStatus.PENDING);

  if (error) {
    logger.warn('Failed to sync pending invitation during direct enrollment', {
      courseId,
      studentEmail,
      studentId,
      error: error.message,
    });
  }
};

const logDirectEnrollmentAudit = async (
  actorUserId: string,
  courseId: string,
  result: DirectEnrollmentResult
): Promise<void> => {
  await auditService.logAuditEvent({
    user_id: actorUserId,
    event_type: DIRECT_ENROLL_AUDIT_EVENT,
    resource_type: 'course',
    resource_id: courseId,
    details: {
      action: 'direct_enroll_by_email',
      student_email: result.student_email,
      status: result.status,
      message: result.message,
      student_id: result.student_id || null,
      enrollment_id: result.enrollment_id || null,
      timestamp: new Date().toISOString(),
    },
  });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fixCourseJoin = (invitation: any): InvitationWithCourse => {
  const course = Array.isArray(invitation.course) ? invitation.course[0] || null : invitation.course;
  return {
    ...invitation,
    course,
  } as InvitationWithCourse;
};

const getCourseWithAccessCheck = async (
  courseId: string,
  userId: string,
  userRole: UserRole
): Promise<{ id: string; teacher_id: string; title: string }> => {
  const { data: course, error } = await supabaseAdmin
    .from('courses')
    .select('id, teacher_id, title')
    .eq('id', courseId)
    .single();

  if (error || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404);
  }

  if (userRole !== UserRole.ADMIN && course.teacher_id !== userId) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You can only manage invitations for your own courses',
      403
    );
  }

  return course;
};

const processDirectEnrollment = async (
  course: { id: string; teacher_id: string; title: string },
  studentEmail: string
): Promise<DirectEnrollmentResult> => {
  const normalizedEmail = normalizeEmail(studentEmail);

  if (!isInstitutionalStudentEmail(normalizedEmail)) {
    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.INVALID_DOMAIN,
      message: `Student email must use @${ALLOWED_DOMAIN}.`,
    };
  }

  const { data: studentProfile, error: studentError } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (studentError) {
    logger.error('Failed to lookup student profile for direct enrollment', {
      courseId: course.id,
      studentEmail: normalizedEmail,
      error: studentError.message,
    });

    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.FAILED,
      message: 'Failed to lookup student account.',
    };
  }

  if (!studentProfile?.id) {
    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.STUDENT_NOT_FOUND,
      message: 'No student account found for this email.',
    };
  }

  if (studentProfile.role !== UserRole.STUDENT) {
    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.NOT_STUDENT,
      message: 'This account is not a student account.',
      student_id: studentProfile.id,
    };
  }

  const isAlreadyEnrolled = await enrollmentService.isStudentEnrolled(course.id, studentProfile.id);

  if (isAlreadyEnrolled) {
    await syncPendingInvitationStatus(course.id, normalizedEmail, studentProfile.id);
    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.ALREADY_ENROLLED,
      message: 'Student is already enrolled.',
      student_id: studentProfile.id,
    };
  }

  try {
    const enrollment = await enrollmentService.enrollStudent(course.id, studentProfile.id);

    await syncPendingInvitationStatus(course.id, normalizedEmail, studentProfile.id);

    try {
      await sendEnrollmentNotification(studentProfile.id, course.title, course.id);
    } catch (notificationError) {
      logger.warn('Failed to send direct enrollment notification', {
        courseId: course.id,
        studentId: studentProfile.id,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }

    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.ENROLLED,
      message: 'Student enrolled successfully.',
      student_id: studentProfile.id,
      enrollment_id: enrollment.id,
    };
  } catch (error) {
    logger.error('Direct enrollment failed', {
      courseId: course.id,
      studentId: studentProfile.id,
      studentEmail: normalizedEmail,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      student_email: normalizedEmail,
      status: DirectEnrollmentStatus.FAILED,
      message: error instanceof Error ? error.message : 'Failed to enroll student.',
      student_id: studentProfile.id,
    };
  }
};

export const directEnrollByEmail = async (
  input: DirectEnrollByEmailInput,
  userId: string,
  userRole: UserRole
): Promise<DirectEnrollmentResult> => {
  const course = await getCourseWithAccessCheck(input.course_id, userId, userRole);
  const result = await processDirectEnrollment(course, input.student_email);
  await logDirectEnrollmentAudit(userId, course.id, result);
  return result;
};

export const bulkDirectEnrollByEmail = async (
  input: BulkDirectEnrollByEmailInput,
  userId: string,
  userRole: UserRole
): Promise<BulkDirectEnrollmentResult> => {
  const course = await getCourseWithAccessCheck(input.course_id, userId, userRole);
  const uniqueEmails = Array.from(new Set(input.student_emails.map((email) => normalizeEmail(email))));

  const results: DirectEnrollmentResult[] = [];

  for (const studentEmail of uniqueEmails) {
    const result = await processDirectEnrollment(course, studentEmail);
    results.push(result);
    await logDirectEnrollmentAudit(userId, course.id, result);
  }

  const enrolled = results.filter((result) => result.status === DirectEnrollmentStatus.ENROLLED).length;
  const alreadyEnrolled = results.filter(
    (result) => result.status === DirectEnrollmentStatus.ALREADY_ENROLLED
  ).length;
  const failed = results.filter((result) => shouldCountAsFailure(result.status)).length;

  return {
    course_id: course.id,
    total: results.length,
    enrolled,
    already_enrolled: alreadyEnrolled,
    failed,
    results,
  };
};

export const createInvitation = async (
  input: CreateInvitationInput,
  userId: string,
  userRole: UserRole
): Promise<InvitationWithCourse> => {
  const normalizedEmail = normalizeEmail(input.student_email);
  await getCourseWithAccessCheck(input.course_id, userId, userRole);

  const { data: existingPending } = await supabaseAdmin
    .from('class_invitations')
    .select('id')
    .eq('course_id', input.course_id)
    .eq('student_email', normalizedEmail)
    .eq('status', InvitationStatus.PENDING)
    .maybeSingle();

  if (existingPending) {
    throw new ApiError(
      ErrorCode.CONFLICT,
      'A pending invitation already exists for this student',
      409
    );
  }

  const { data: existingStudent } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingStudent?.role && existingStudent.role !== UserRole.STUDENT) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'Invitations can only be sent to student accounts',
      400
    );
  }

  if (existingStudent?.id) {
    const isAlreadyEnrolled = await enrollmentService.isStudentEnrolled(input.course_id, existingStudent.id);
    if (isAlreadyEnrolled) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'Student is already enrolled in this course',
        409
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from('class_invitations')
    .insert({
      course_id: input.course_id,
      invited_by: userId,
      student_email: normalizedEmail,
      student_id: existingStudent?.id || null,
      status: InvitationStatus.PENDING,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(`
      id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at,
      course:courses(id, title, teacher_id)
    `)
    .single();

  if (error || !data) {
    logger.error('Failed to create invitation', {
      courseId: input.course_id,
      studentEmail: normalizedEmail,
      error: error?.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create invitation', 500);
  }

  return fixCourseJoin(data);
};

export const listMyInvitations = async (
  userId: string,
  userEmail: string,
  query: InvitationQuery
): Promise<{ invitations: InvitationWithCourse[]; total: number }> => {
  const normalizedEmail = normalizeEmail(userEmail);

  let queryBuilder = supabaseAdmin
    .from('class_invitations')
    .select(`
      id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at,
      course:courses(id, title, teacher_id)
    `, { count: 'exact' })
    .eq('student_email', normalizedEmail);

  if (query.status) {
    queryBuilder = queryBuilder.eq('status', query.status);
  }

  const { data, error, count } = await queryBuilder
    .order('sent_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to list my invitations', { userId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch invitations', 500);
  }

  return {
    invitations: (data || []).map(fixCourseJoin),
    total: count || 0,
  };
};

export const listCourseInvitations = async (
  courseId: string,
  userId: string,
  userRole: UserRole,
  query: InvitationQuery
): Promise<{ invitations: InvitationWithCourse[]; total: number }> => {
  await getCourseWithAccessCheck(courseId, userId, userRole);

  let queryBuilder = supabaseAdmin
    .from('class_invitations')
    .select(`
      id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at,
      course:courses(id, title, teacher_id)
    `, { count: 'exact' })
    .eq('course_id', courseId);

  if (query.status) {
    queryBuilder = queryBuilder.eq('status', query.status);
  }

  const { data, error, count } = await queryBuilder
    .order('sent_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (error) {
    logger.error('Failed to list course invitations', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to fetch course invitations', 500);
  }

  return {
    invitations: (data || []).map(fixCourseJoin),
    total: count || 0,
  };
};

const getInvitationForStudentAction = async (
  invitationId: string,
  userId: string,
  userEmail: string
): Promise<Invitation> => {
  const { data, error } = await supabaseAdmin
    .from('class_invitations')
    .select('id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at')
    .eq('id', invitationId)
    .single();

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Invitation not found', 404);
  }

  const normalizedEmail = normalizeEmail(userEmail);
  const isRecipient = data.student_id === userId || normalizeEmail(data.student_email) === normalizedEmail;

  if (!isRecipient) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'You can only respond to your own invitations', 403);
  }

  if (data.status !== InvitationStatus.PENDING) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Invitation has already been processed', 400);
  }

  return data as Invitation;
};

export const acceptInvitation = async (
  invitationId: string,
  userId: string,
  userEmail: string
): Promise<{ invitation: Invitation; enrollment: unknown }> => {
  const invitation = await getInvitationForStudentAction(invitationId, userId, userEmail);

  const enrollment = await enrollmentService.enrollStudent(invitation.course_id, userId);

  const { data, error } = await supabaseAdmin
    .from('class_invitations')
    .update({
      status: InvitationStatus.ACCEPTED,
      student_id: userId,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
    .select('id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at')
    .single();

  if (error || !data) {
    logger.error('Failed to accept invitation', { invitationId, userId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to accept invitation', 500);
  }

  return {
    invitation: data as Invitation,
    enrollment,
  };
};

export const declineInvitation = async (
  invitationId: string,
  userId: string,
  userEmail: string
): Promise<Invitation> => {
  await getInvitationForStudentAction(invitationId, userId, userEmail);

  const { data, error } = await supabaseAdmin
    .from('class_invitations')
    .update({
      status: InvitationStatus.DECLINED,
      student_id: userId,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
    .select('id, course_id, invited_by, student_email, student_id, status, sent_at, responded_at, created_at, updated_at')
    .single();

  if (error || !data) {
    logger.error('Failed to decline invitation', { invitationId, userId, error: error?.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to decline invitation', 500);
  }

  return data as Invitation;
};
