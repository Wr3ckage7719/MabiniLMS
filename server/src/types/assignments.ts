import { z } from 'zod';

// ============================================
// Enums
// ============================================

export enum SubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  LATE = 'late',
  UNDER_REVIEW = 'under_review',
  GRADED = 'graded',
}

export const submissionStorageProviderSchema = z.enum(['google_drive']);
export type SubmissionStorageProvider = z.infer<typeof submissionStorageProviderSchema>;

export const assignmentCategorySchema = z.enum(['exam', 'quiz', 'activity']);
export type AssignmentCategory = z.infer<typeof assignmentCategorySchema>;
export const questionOrderModeSchema = z.enum(['sequence', 'random']);
export type QuestionOrderMode = z.infer<typeof questionOrderModeSchema>;

const proctoringPolicySchema = z.object({
  max_violations: z.number().int().min(1).max(20).optional(),
  terminate_on_fullscreen_exit: z.boolean().optional(),
  auto_submit_on_tab_switch: z.boolean().optional(),
  auto_submit_on_fullscreen_exit: z.boolean().optional(),
  require_agreement_before_start: z.boolean().optional(),
  block_clipboard: z.boolean().optional(),
  block_context_menu: z.boolean().optional(),
  block_print_shortcut: z.boolean().optional(),
  // Backward-compatible aliases
  maxViolations: z.number().int().min(1).max(20).optional(),
  terminateOnFullscreenExit: z.boolean().optional(),
  autoSubmitOnTabSwitch: z.boolean().optional(),
  autoSubmitOnFullscreenExit: z.boolean().optional(),
  requireAgreementBeforeStart: z.boolean().optional(),
  blockClipboard: z.boolean().optional(),
  blockContextMenu: z.boolean().optional(),
  blockPrintShortcut: z.boolean().optional(),
});

const examChapterPoolSchema = z.object({
  enabled: z.boolean().default(false),
  chapters: z
    .array(
      z.object({
        tag: z.string().trim().min(1).max(120),
        take: z.number().int().min(1).max(500).optional(),
      })
    )
    .default([]),
  total_questions: z.number().int().min(1).max(500).optional(),
});
export type ExamChapterPoolSettings = z.infer<typeof examChapterPoolSchema>;

// ============================================
// Assignment Schemas
// ============================================

export const createAssignmentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  assignment_type: assignmentCategorySchema.default('activity'),
  question_order_mode: questionOrderModeSchema.default('sequence').optional(),
  question_order: questionOrderModeSchema.optional(),
  order_mode: questionOrderModeSchema.optional(),
  exam_question_selection_mode: questionOrderModeSchema.default('random').optional(),
  exam_selection_mode: questionOrderModeSchema.optional(),
  exam_chapter_pool: examChapterPoolSchema.optional(),
  chapter_pool: examChapterPoolSchema.optional(),
  due_date: z.string().datetime().optional(),
  max_points: z.number().int().min(0).max(1000).default(100),
  submissions_open: z.boolean().optional().default(true),
  submission_open_at: z.string().datetime().nullable().optional(),
  submission_close_at: z.string().datetime().nullable().optional(),
  is_proctored: z.boolean().optional(),
  exam_duration_minutes: z.number().int().min(5).max(300).optional(),
  proctoring_policy: proctoringPolicySchema.optional(),
}).superRefine((value, ctx) => {
  if (value.submission_open_at && value.submission_close_at) {
    const openAt = new Date(value.submission_open_at).getTime();
    const closeAt = new Date(value.submission_close_at).getTime();
    const shouldEnforceWindowOrdering = value.submissions_open !== true;

    if (shouldEnforceWindowOrdering && closeAt < openAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['submission_close_at'],
        message: 'Submission close time must be after submission open time',
      });
    }
  }
});

export const updateAssignmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  assignment_type: assignmentCategorySchema.optional(),
  question_order_mode: questionOrderModeSchema.optional(),
  question_order: questionOrderModeSchema.optional(),
  order_mode: questionOrderModeSchema.optional(),
  exam_question_selection_mode: questionOrderModeSchema.optional(),
  exam_selection_mode: questionOrderModeSchema.optional(),
  exam_chapter_pool: examChapterPoolSchema.optional(),
  chapter_pool: examChapterPoolSchema.optional(),
  due_date: z.string().datetime().nullable().optional(),
  max_points: z.number().int().min(0).max(1000).optional(),
  submissions_open: z.boolean().optional(),
  submission_open_at: z.string().datetime().nullable().optional(),
  submission_close_at: z.string().datetime().nullable().optional(),
  is_proctored: z.boolean().optional(),
  exam_duration_minutes: z.number().int().min(5).max(300).nullable().optional(),
  proctoring_policy: proctoringPolicySchema.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.submission_open_at && value.submission_close_at) {
    const openAt = new Date(value.submission_open_at).getTime();
    const closeAt = new Date(value.submission_close_at).getTime();
    const shouldEnforceWindowOrdering = value.submissions_open === false;

    if (shouldEnforceWindowOrdering && closeAt < openAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['submission_close_at'],
        message: 'Submission close time must be after submission open time',
      });
    }
  }
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
  provider: submissionStorageProviderSchema.default('google_drive').optional(),
  provider_file_id: z.string().trim().min(1, 'Provider file ID is required').optional(),
  provider_file_name: z.string().trim().min(1, 'File name is required').optional(),
  // Legacy aliases kept for backward compatibility with existing clients.
  drive_file_id: z.string().trim().min(1, 'Google Drive file ID is required').optional(),
  drive_file_name: z.string().trim().min(1, 'File name is required').optional(),
  content: z.string().optional(), // Optional text content
  sync_key: z.string().min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  const fileId = value.provider_file_id || value.drive_file_id;

  if (!fileId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['provider_file_id'],
      message: 'A submission file reference is required',
    });
  }
});

export const updateSubmissionSchema = z.object({
  provider: submissionStorageProviderSchema.optional(),
  provider_file_id: z.string().trim().min(1).optional(),
  provider_file_name: z.string().trim().min(1).optional(),
  // Legacy aliases kept for backward compatibility with existing clients.
  drive_file_id: z.string().trim().min(1).optional(),
  drive_file_name: z.string().trim().min(1).optional(),
  content: z.string().optional(),
});

export const submissionIdParamSchema = z.object({
  id: z.string().uuid('Invalid submission ID'),
});

export const assignmentSubmissionsParamSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
});

export const transitionSubmissionStatusSchema = z.object({
  status: z.nativeEnum(SubmissionStatus),
  reason: z.string().trim().max(2000).optional(),
});

export const requestRevisionSchema = z.object({
  reason: z.string().trim().min(1, 'Revision reason is required').max(2000),
});

// ============================================
// Assignment Comment Schemas
// ============================================

export const createAssignmentCommentSchema = z.object({
  content: z.string().trim().min(1, 'Comment content is required').max(5000),
});

export const assignmentCommentsParamSchema = z.object({
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
export type TransitionSubmissionStatusInput = z.infer<typeof transitionSubmissionStatusSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type CreateAssignmentCommentInput = z.infer<typeof createAssignmentCommentSchema>;

export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  assignment_type: AssignmentCategory;
  question_order_mode?: QuestionOrderMode;
  exam_question_selection_mode?: QuestionOrderMode;
  exam_chapter_pool?: ExamChapterPoolSettings;
  due_date: string | null;
  max_points: number;
  submissions_open?: boolean;
  submission_open_at?: string | null;
  submission_close_at?: string | null;
  is_proctored?: boolean;
  exam_duration_minutes?: number | null;
  proctoring_policy?: Record<string, unknown>;
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
  storage_provider: SubmissionStorageProvider;
  provider_file_id: string | null;
  provider_revision_id: string | null;
  provider_mime_type: string | null;
  provider_size_bytes: number | null;
  provider_checksum: string | null;
  submission_snapshot_at: string | null;
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
    assignment_type?: AssignmentCategory;
    max_points: number;
  };
}

export interface SubmissionStatusHistoryEntry {
  id: string;
  submission_id: string;
  from_status: SubmissionStatus | null;
  to_status: SubmissionStatus;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role?: string;
  } | null;
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

export interface AssignmentComment {
  id: string;
  assignment_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AssignmentCommentWithAuthor extends AssignmentComment {
  author: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role?: string;
  };
}
