import { z } from 'zod'

export const proctorViolationTypeValues = [
  'visibility_hidden',
  'fullscreen_exit',
  'context_menu',
  'copy',
  'paste',
  'cut',
  'print_shortcut',
  'devtools_open',
] as const

export const proctorViolationTypeSchema = z.enum(proctorViolationTypeValues)

export const examAssignmentParamSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
})

export const examAttemptParamSchema = z.object({
  attemptId: z.string().uuid('Invalid exam attempt ID'),
})

export const examQuestionParamSchema = z.object({
  questionId: z.string().uuid('Invalid exam question ID'),
})

const questionChoicesSchema = z
  .array(z.string().trim().min(1, 'Choice text is required').max(1000))
  .min(2, 'At least 2 choices are required')
  .max(10, 'At most 10 choices are allowed')

export const createExamQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1, 'Question prompt is required').max(5000),
    choices: questionChoicesSchema,
    correct_choice_index: z.number().int().min(0),
    points: z.number().positive().max(1000).default(1),
    explanation: z.string().trim().max(5000).optional(),
    order_index: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.correct_choice_index >= value.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correct_choice_index'],
        message: 'correct_choice_index must reference an existing choice',
      })
    }
  })

export const updateExamQuestionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(5000).optional(),
    choices: questionChoicesSchema.optional(),
    correct_choice_index: z.number().int().min(0).optional(),
    points: z.number().positive().max(1000).optional(),
    explanation: z.string().trim().max(5000).nullable().optional(),
    order_index: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.choices
      && value.correct_choice_index !== undefined
      && value.correct_choice_index >= value.choices.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correct_choice_index'],
        message: 'correct_choice_index must reference an existing choice',
      })
    }
  })

export const startExamAttemptSchema = z.object({
  resume_active_attempt: z.boolean().default(true).optional(),
})

export const submitExamAnswerSchema = z.object({
  question_id: z.string().uuid('Invalid question ID'),
  selected_choice_index: z.number().int().min(0),
})

export const reportExamViolationSchema = z.object({
  violation_type: proctorViolationTypeSchema,
  metadata: z.record(z.unknown()).optional(),
})

export const submitExamAttemptSchema = z.object({
  force_submit: z.boolean().optional(),
})

export const listViolationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ProctorViolationType = z.infer<typeof proctorViolationTypeSchema>

export type CreateExamQuestionInput = z.infer<typeof createExamQuestionSchema>
export type UpdateExamQuestionInput = z.infer<typeof updateExamQuestionSchema>
export type StartExamAttemptInput = z.infer<typeof startExamAttemptSchema>
export type SubmitExamAnswerInput = z.infer<typeof submitExamAnswerSchema>
export type ReportExamViolationInput = z.infer<typeof reportExamViolationSchema>
export type SubmitExamAttemptInput = z.infer<typeof submitExamAttemptSchema>
export type ListViolationsQuery = z.infer<typeof listViolationsQuerySchema>

export interface ProctoringPolicy {
  max_violations: number
  terminate_on_fullscreen_exit: boolean
  block_clipboard: boolean
  block_context_menu: boolean
  block_print_shortcut: boolean
}

export interface ExamQuestion {
  id: string
  assignment_id: string
  prompt: string
  choices: string[]
  correct_choice_index: number
  points: number
  explanation: string | null
  order_index: number
  created_at: string
  updated_at: string
}

export interface ExamRenderedChoice {
  rendered_index: number
  original_index: number
  text: string
}

export interface ExamQuestionForAttempt {
  id: string
  prompt: string
  points: number
  explanation?: string | null
  choices: ExamRenderedChoice[]
}

export interface ExamAttempt {
  id: string
  assignment_id: string
  student_id: string
  status: 'active' | 'submitted' | 'terminated' | 'timed_out'
  seed: number
  rendered_question_order: string[]
  rendered_choice_orders: Record<string, number[]>
  started_at: string
  ended_at: string | null
  submitted_at: string | null
}

export interface ExamAttemptSession {
  attempt: ExamAttempt
  assignment: {
    id: string
    title: string
    max_points: number
    due_date: string | null
    exam_duration_minutes: number | null
    is_proctored: boolean
  }
  policy: ProctoringPolicy
  questions: ExamQuestionForAttempt[]
}

export interface ExamViolation {
  id: string
  attempt_id: string
  assignment_id: string
  student_id: string
  violation_type: ProctorViolationType
  metadata: Record<string, unknown>
  created_at: string
}

export interface ExamSubmissionResult {
  attempt_id: string
  submission_id: string
  grade_id: string
  score: number
  max_score: number
  percentage: number
  answered_count: number
  total_questions: number
  violation_count: number
}
