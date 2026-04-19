import { apiClient } from './api-client'

export type ProctorViolationType =
  | 'visibility_hidden'
  | 'fullscreen_exit'
  | 'context_menu'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'print_shortcut'
  | 'devtools_open'

export interface ProctoringPolicy {
  max_violations: number
  terminate_on_fullscreen_exit: boolean
  block_clipboard: boolean
  block_context_menu: boolean
  block_print_shortcut: boolean
}

export type ExamQuestionItemType = 'multiple_choice' | 'true_false' | 'short_answer'

export interface ExamQuestion {
  id: string
  assignment_id: string
  prompt: string
  item_type: ExamQuestionItemType
  answer_payload: Record<string, unknown>
  chapter_tag: string | null
  choices: string[]
  correct_choice_index: number
  points: number
  explanation: string | null
  order_index: number
  created_at: string
  updated_at: string
}

export interface CreateExamQuestionPayload {
  prompt: string
  item_type?: ExamQuestionItemType
  choices?: string[]
  correct_choice_index?: number
  answer_payload?: Record<string, unknown>
  points?: number
  explanation?: string
  order_index?: number
  chapter_tag?: string | null
}

export interface UpdateExamQuestionPayload {
  prompt?: string
  item_type?: ExamQuestionItemType
  choices?: string[]
  correct_choice_index?: number
  answer_payload?: Record<string, unknown>
  points?: number
  explanation?: string | null
  order_index?: number
  chapter_tag?: string | null
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

export interface ExamViolation {
  id: string
  attempt_id: string
  assignment_id: string
  student_id: string
  violation_type: ProctorViolationType
  metadata: Record<string, unknown>
  created_at: string
}

const unwrapData = <T>(response: { success?: boolean; data?: T }): T => {
  return (response?.data as T) || ({} as T)
}

export const examsService = {
  async listExamQuestions(assignmentId: string): Promise<ExamQuestion[]> {
    const response = await apiClient.get<{ success: boolean; data: ExamQuestion[] }>(
      `/assignments/${assignmentId}/exam/questions`
    )
    return unwrapData(response) || []
  },

  async createExamQuestion(assignmentId: string, payload: CreateExamQuestionPayload): Promise<ExamQuestion> {
    const response = await apiClient.post<{ success: boolean; data: ExamQuestion }>(
      `/assignments/${assignmentId}/exam/questions`,
      payload
    )
    return unwrapData(response)
  },

  async updateExamQuestion(
    assignmentId: string,
    questionId: string,
    payload: UpdateExamQuestionPayload
  ): Promise<ExamQuestion> {
    const response = await apiClient.patch<{ success: boolean; data: ExamQuestion }>(
      `/assignments/${assignmentId}/exam/questions/${questionId}`,
      payload
    )
    return unwrapData(response)
  },

  async deleteExamQuestion(assignmentId: string, questionId: string): Promise<void> {
    await apiClient.delete(`/assignments/${assignmentId}/exam/questions/${questionId}`)
  },

  async startExamAttempt(
    assignmentId: string,
    options?: { resume_active_attempt?: boolean }
  ): Promise<ExamAttemptSession> {
    const response = await apiClient.post<{ success: boolean; data: ExamAttemptSession }>(
      `/assignments/${assignmentId}/exam/attempts/start`,
      options || {}
    )
    return unwrapData(response)
  },

  async getExamAttemptSession(attemptId: string): Promise<ExamAttemptSession> {
    const response = await apiClient.get<{ success: boolean; data: ExamAttemptSession }>(
      `/assignments/exam/attempts/${attemptId}`
    )
    return unwrapData(response)
  },

  async submitExamAnswer(
    attemptId: string,
    payload: { question_id: string; selected_choice_index: number }
  ): Promise<{ attempt_id: string; question_id: string; is_correct: boolean; points_awarded: number }> {
    const response = await apiClient.post<{
      success: boolean
      data: { attempt_id: string; question_id: string; is_correct: boolean; points_awarded: number }
    }>(`/assignments/exam/attempts/${attemptId}/answers`, payload)
    return unwrapData(response)
  },

  async reportExamViolation(
    attemptId: string,
    payload: { violation_type: ProctorViolationType; metadata?: Record<string, unknown> }
  ): Promise<{ attempt_status: ExamAttempt['status']; violation_count: number; terminated: boolean }> {
    const response = await apiClient.post<{
      success: boolean
      data: { attempt_status: ExamAttempt['status']; violation_count: number; terminated: boolean }
    }>(`/assignments/exam/attempts/${attemptId}/violations`, payload)
    return unwrapData(response)
  },

  async listAttemptViolations(
    attemptId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ violations: ExamViolation[]; total: number }> {
    const query = new URLSearchParams()
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    if (params?.offset !== undefined) query.set('offset', String(params.offset))

    const response = await apiClient.get<{
      success: boolean
      data: ExamViolation[]
      meta?: { total?: number }
    }>(`/assignments/exam/attempts/${attemptId}/violations${query.toString() ? `?${query}` : ''}`)

    return {
      violations: response?.data || [],
      total: Number(response?.meta?.total || (response?.data?.length || 0)),
    }
  },

  async listAssignmentViolations(
    assignmentId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<{ violations: ExamViolation[]; total: number }> {
    const query = new URLSearchParams()
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    if (params?.offset !== undefined) query.set('offset', String(params.offset))

    const response = await apiClient.get<{
      success: boolean
      data: ExamViolation[]
      meta?: { total?: number }
    }>(`/assignments/${assignmentId}/exam/violations${query.toString() ? `?${query}` : ''}`)

    return {
      violations: response?.data || [],
      total: Number(response?.meta?.total || (response?.data?.length || 0)),
    }
  },

  async submitExamAttempt(attemptId: string): Promise<ExamSubmissionResult> {
    const response = await apiClient.post<{ success: boolean; data: ExamSubmissionResult }>(
      `/assignments/exam/attempts/${attemptId}/submit`,
      {}
    )
    return unwrapData(response)
  },
}
