import { z } from 'zod';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export enum DirectEnrollmentStatus {
  ENROLLED = 'enrolled',
  ALREADY_ENROLLED = 'already_enrolled',
  INVALID_DOMAIN = 'invalid_domain',
  STUDENT_NOT_FOUND = 'student_not_found',
  NOT_STUDENT = 'not_student',
  FAILED = 'failed',
}

const normalizedEmailSchema = z
  .string()
  .email('Valid student email is required')
  .transform((value) => value.trim().toLowerCase());

export const createInvitationSchema = z.object({
  course_id: z.string().uuid('Invalid course ID'),
  student_email: normalizedEmailSchema,
});

export const directEnrollByEmailSchema = z.object({
  course_id: z.string().uuid('Invalid course ID'),
  student_email: normalizedEmailSchema,
});

export const bulkDirectEnrollByEmailSchema = z.object({
  course_id: z.string().uuid('Invalid course ID'),
  student_emails: z.array(normalizedEmailSchema).min(1).max(100),
});

export const invitationIdParamSchema = z.object({
  id: z.string().uuid('Invalid invitation ID'),
});

export const courseInvitationsParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export const invitationQuerySchema = z.object({
  status: z.nativeEnum(InvitationStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type DirectEnrollByEmailInput = z.infer<typeof directEnrollByEmailSchema>;
export type BulkDirectEnrollByEmailInput = z.infer<typeof bulkDirectEnrollByEmailSchema>;
export type InvitationQuery = z.infer<typeof invitationQuerySchema>;

export interface DirectEnrollmentResult {
  student_email: string;
  status: DirectEnrollmentStatus;
  message: string;
  student_id?: string | null;
  enrollment_id?: string | null;
}

export interface BulkDirectEnrollmentResult {
  course_id: string;
  total: number;
  enrolled: number;
  already_enrolled: number;
  failed: number;
  results: DirectEnrollmentResult[];
}

export interface Invitation {
  id: string;
  course_id: string;
  invited_by: string;
  student_email: string;
  student_id: string | null;
  status: InvitationStatus;
  sent_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitationWithCourse extends Invitation {
  course: {
    id: string;
    title: string;
    teacher_id: string;
  } | null;
}

export interface InvitationWithActor extends Invitation {
  course: {
    id: string;
    title: string;
    teacher_id: string;
  } | null;
  invited_by_profile: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
}
