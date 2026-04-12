import { z } from 'zod';

// Enrollment status enum
export enum EnrollmentStatus {
  ACTIVE = 'active',
  DROPPED = 'dropped',
  COMPLETED = 'completed',
}

// Zod schemas
export const enrollInCourseSchema = z.object({
  course_id: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^[0-9a-f]{8}$/i.test(value) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
      'Invalid class code'
    ),
});

export const updateEnrollmentStatusSchema = z.object({
  status: z.nativeEnum(EnrollmentStatus),
});

export const enrollmentQuerySchema = z.object({
  status: z.nativeEnum(EnrollmentStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// TypeScript types
export type EnrollInCourseInput = z.infer<typeof enrollInCourseSchema>;
export type UpdateEnrollmentStatusInput = z.infer<typeof updateEnrollmentStatusSchema>;
export type EnrollmentQuery = z.infer<typeof enrollmentQuerySchema>;

export interface Enrollment {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  status: EnrollmentStatus;
}

export interface EnrollmentWithCourse extends Enrollment {
  course: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    teacher: {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
    };
  };
}

export interface EnrollmentWithStudent extends Enrollment {
  student: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}
