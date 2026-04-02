import { z } from 'zod';

// ============================================
// Enums
// ============================================

export enum SubmissionStatus {
  SUBMITTED = 'submitted',
  GRADED = 'graded',
  LATE = 'late',
}

// ============================================
// Assignment Schemas
// ============================================

export const createAssignmentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  due_date: z.string().datetime().optional(),
  max_points: z.number().int().min(0).max(1000).default(100),
});

export const updateAssignmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  due_date: z.string().datetime().nullable().optional(),
  max_points: z.number().int().min(0).max(1000).optional(),
});

export const assignmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid assignment ID'),
});

export const courseAssignmentsParamSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
});

export const listAssignmentsQuerySchema = z.object({
  course_id: z.string().uuid().optional(),
  include_past: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ============================================
// Submission Schemas
// ============================================

export const createSubmissionSchema = z.object({
  drive_file_id: z.string().min(1, 'Google Drive file ID is required'),
  drive_file_name: z.string().min(1, 'File name is required'),
  content: z.string().optional(), // Optional text content
});

export const updateSubmissionSchema = z.object({
  drive_file_id: z.string().min(1).optional(),
  drive_file_name: z.string().optional(),
  content: z.string().optional(),
});

export const submissionIdParamSchema = z.object({
  id: z.string().uuid('Invalid submission ID'),
});

export const assignmentSubmissionsParamSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
});

// ============================================
// TypeScript Types
// ============================================

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;

export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_points: number;
  created_at: string;
}

export interface AssignmentWithCourse extends Assignment {
  course: {
    id: string;
    title: string;
    teacher: {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
    };
  };
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  file_url: string | null;
  drive_file_id: string | null;
  drive_view_link: string | null;
  drive_file_name: string | null;
  submitted_at: string;
  status: SubmissionStatus;
}

export interface SubmissionWithStudent extends Submission {
  student: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  assignment: {
    id: string;
    title: string;
    max_points: number;
  };
}

export interface SubmissionWithGrade extends SubmissionWithStudent {
  grade?: {
    id: string;
    points_earned: number;
    feedback: string | null;
    graded_by: string;
    graded_at: string;
  };
}
