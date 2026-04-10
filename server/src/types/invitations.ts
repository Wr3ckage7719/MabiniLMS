import { z } from 'zod';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export const createInvitationSchema = z.object({
  course_id: z.string().uuid('Invalid course ID'),
  student_email: z.string().email('Valid student email is required').transform((value) => value.trim().toLowerCase()),
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
export type InvitationQuery = z.infer<typeof invitationQuerySchema>;

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
