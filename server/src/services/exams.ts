import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode, UserRole } from '../types/index.js'
import {
  CreateExamQuestionInput,
  ExamAttempt,
  ExamAttemptSession,
  ExamQuestionItemType,
  ExamQuestion,
  ExamQuestionForAttempt,
  ExamQuestionResult,
  ExamSubmissionResult,
  ExamViolation,
  ListViolationsQuery,
  ProctoringPolicy,
  ReportExamViolationInput,
  ReportExamViolationResult,
  StartExamAttemptInput,
  SubmitExamAnswerInput,
} from '../types/exams.js'
import * as enrollmentService from './enrollments.js'
import { createGrade, updateGrade } from './grades.js'
import logger from '../utils/logger.js'
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js'

type AssignmentContext = {
  id: string
  title: string
  assignment_type: string
  question_order_mode: 'sequence' | 'random'
  exam_question_selection_mode: 'sequence' | 'random'
  exam_chapter_pool: {
    enabled: boolean
    chapters: Array<{ tag: string; take?: number }>
    total_questions?: number
  }
  max_points: number
  due_date: string | null
  course_id: string
  teacher_id: string | null
  is_proctored: boolean
  exam_duration_minutes: number | null
  proctoring_policy: unknown
}

type AttemptContext = {
  attempt: ExamAttempt
  assignment: AssignmentContext
}

type DatabaseErrorShape = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const EXAM_QUESTION_COMPAT_OPTIONAL_COLUMNS = new Set<string>([
  'item_type',
  'answer_payload',
  'chapter_tag',
])

const defaultPolicy: ProctoringPolicy = {
  max_violations: 3,
  terminate_on_fullscreen_exit: false,
  auto_submit_on_tab_switch: false,
  auto_submit_on_fullscreen_exit: false,
  require_agreement_before_start: true,
  block_clipboard: true,
  block_context_menu: true,
  block_print_shortcut: true,
  one_question_at_a_time: false,
}

const examHardPolicyAutoSubmitEnabled = process.env.FEATURE_EXAM_HARD_POLICY_AUTOSUBMIT !== 'false'

const normalizeDbErrorText = (error?: DatabaseErrorShape | null): string => {
  return [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

const extractMissingColumnName = (error?: DatabaseErrorShape | null): string | null => {
  const message = normalizeDbErrorText(error)
  const match = message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i)
  return match?.[1] || null
}

const toNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

const roundToTwo = (value: number): number => {
  return Math.round(value * 100) / 100
}

const toPolicy = (raw: unknown): ProctoringPolicy => {
  if (!raw || typeof raw !== 'object') {
    return defaultPolicy
  }

  const policy = raw as Record<string, unknown>

  const legacyTerminateOnFullscreenExit =
    typeof policy.terminate_on_fullscreen_exit === 'boolean'
      ? policy.terminate_on_fullscreen_exit
      : typeof policy.terminateOnFullscreenExit === 'boolean'
        ? policy.terminateOnFullscreenExit
        : defaultPolicy.terminate_on_fullscreen_exit

  const autoSubmitOnFullscreenExit =
    typeof policy.auto_submit_on_fullscreen_exit === 'boolean'
      ? policy.auto_submit_on_fullscreen_exit
      : typeof policy.autoSubmitOnFullscreenExit === 'boolean'
        ? policy.autoSubmitOnFullscreenExit
        : legacyTerminateOnFullscreenExit

  return {
    max_violations: Math.max(
      1,
      Math.floor(toNumber(policy.max_violations ?? policy.maxViolations, defaultPolicy.max_violations))
    ),
    terminate_on_fullscreen_exit: legacyTerminateOnFullscreenExit,
    auto_submit_on_tab_switch:
      typeof policy.auto_submit_on_tab_switch === 'boolean'
        ? policy.auto_submit_on_tab_switch
        : typeof policy.autoSubmitOnTabSwitch === 'boolean'
          ? policy.autoSubmitOnTabSwitch
          : defaultPolicy.auto_submit_on_tab_switch,
    auto_submit_on_fullscreen_exit: autoSubmitOnFullscreenExit,
    require_agreement_before_start:
      typeof policy.require_agreement_before_start === 'boolean'
        ? policy.require_agreement_before_start
        : typeof policy.requireAgreementBeforeStart === 'boolean'
          ? policy.requireAgreementBeforeStart
          : defaultPolicy.require_agreement_before_start,
    block_clipboard:
      typeof policy.block_clipboard === 'boolean'
        ? policy.block_clipboard
        : typeof policy.blockClipboard === 'boolean'
          ? policy.blockClipboard
        : defaultPolicy.block_clipboard,
    block_context_menu:
      typeof policy.block_context_menu === 'boolean'
        ? policy.block_context_menu
        : typeof policy.blockContextMenu === 'boolean'
          ? policy.blockContextMenu
        : defaultPolicy.block_context_menu,
    block_print_shortcut:
      typeof policy.block_print_shortcut === 'boolean'
        ? policy.block_print_shortcut
        : typeof policy.blockPrintShortcut === 'boolean'
          ? policy.blockPrintShortcut
        : defaultPolicy.block_print_shortcut,
    one_question_at_a_time:
      typeof policy.one_question_at_a_time === 'boolean'
        ? policy.one_question_at_a_time
        : defaultPolicy.one_question_at_a_time,
  }
}

const toChoiceArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

const normalizeExamQuestionItemType = (value: unknown): ExamQuestionItemType => {
  if (value === 'multiple_choice' || value === 'true_false' || value === 'short_answer') {
    return value
  }

  return 'multiple_choice'
}

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const normalizeMode = (value: unknown, fallback: 'sequence' | 'random'): 'sequence' | 'random' => {
  if (value === 'sequence' || value === 'random') {
    return value
  }

  return fallback
}

const toChapterPool = (
  raw: unknown
): { enabled: boolean; chapters: Array<{ tag: string; take?: number }>; total_questions?: number } => {
  const source = toRecord(raw)
  const chapters = Array.isArray(source.chapters)
    ? source.chapters
        .map((entry) => {
          const chapterEntry = toRecord(entry)
          const tag = typeof chapterEntry.tag === 'string' ? chapterEntry.tag.trim() : ''
          const take = Number.isInteger(chapterEntry.take) && Number(chapterEntry.take) > 0
            ? Number(chapterEntry.take)
            : undefined

          if (!tag) {
            return null
          }

          return {
            tag,
            ...(take ? { take } : {}),
          }
        })
        .filter((entry): entry is { tag: string; take?: number } => Boolean(entry))
    : []

  const totalQuestions = Number.isInteger(source.total_questions) && Number(source.total_questions) > 0
    ? Number(source.total_questions)
    : undefined

  return {
    enabled: Boolean(source.enabled),
    chapters,
    ...(totalQuestions ? { total_questions: totalQuestions } : {}),
  }
}

const parseExamQuestion = (row: Record<string, unknown>): ExamQuestion => {
  const itemType = normalizeExamQuestionItemType(row.item_type)

  return {
    id: String(row.id),
    assignment_id: String(row.assignment_id),
    prompt: String(row.prompt || ''),
    item_type: itemType,
    answer_payload: toRecord(row.answer_payload),
    chapter_tag: row.chapter_tag ? String(row.chapter_tag) : null,
    choices: toChoiceArray(row.choices),
    correct_choice_index: toNumber(row.correct_choice_index, 0),
    points: roundToTwo(toNumber(row.points, 1)),
    explanation: row.explanation ? String(row.explanation) : null,
    order_index: toNumber(row.order_index, 0),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  }
}

const parseJsonArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item : String(item || '')))
    .filter((item) => item.length > 0)
}

const parseChoiceOrderMap = (value: unknown): Record<string, number[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const result: Record<string, number[]> = {}
  for (const [key, rawOrder] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawOrder)) {
      continue
    }

    result[key] = rawOrder
      .map((entry) => toNumber(entry, -1))
      .filter((entry) => Number.isInteger(entry) && entry >= 0)
  }

  return result
}

const parseExamAttempt = (row: Record<string, unknown>): ExamAttempt => {
  const seedValue = toNumber(row.seed, Date.now())

  return {
    id: String(row.id),
    assignment_id: String(row.assignment_id),
    student_id: String(row.student_id),
    status: (row.status as ExamAttempt['status']) || 'active',
    seed: Math.floor(seedValue),
    rendered_question_order: parseJsonArray(row.rendered_question_order),
    rendered_choice_orders: parseChoiceOrderMap(row.rendered_choice_orders),
    started_at: String(row.started_at || new Date().toISOString()),
    ended_at: row.ended_at ? String(row.ended_at) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
  }
}

const getAssignmentContext = async (assignmentId: string): Promise<AssignmentContext> => {
  const hasAssignmentTypeColumn = await supportsAssignmentTypeColumn()
  const query = hasAssignmentTypeColumn
    ? supabaseAdmin
        .from('assignments')
        .select(`
          id, title, assignment_type, question_order_mode, exam_question_selection_mode,
          exam_chapter_pool, max_points, due_date, course_id,
          is_proctored, exam_duration_minutes, proctoring_policy,
          course:courses(id, teacher_id)
        `)
        .eq('id', assignmentId)
        .single()
    : supabaseAdmin
        .from('assignments')
        .select(`
          id, title, question_order_mode, exam_question_selection_mode,
          exam_chapter_pool, max_points, due_date, course_id,
          is_proctored, exam_duration_minutes, proctoring_policy,
          course:courses(id, teacher_id)
        `)
        .eq('id', assignmentId)
        .single()

  const { data, error } = await query

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Assignment not found', 404)
  }

  const assignment = data as Record<string, unknown>
  const course = Array.isArray(assignment.course)
    ? (assignment.course[0] as Record<string, unknown> | undefined)
    : (assignment.course as Record<string, unknown> | undefined)

  return {
    id: String(assignment.id),
    title: String(assignment.title || 'Exam'),
    assignment_type: normalizeAssignmentType(assignment.assignment_type),
    question_order_mode: normalizeMode(assignment.question_order_mode, 'sequence'),
    exam_question_selection_mode: normalizeMode(assignment.exam_question_selection_mode, 'random'),
    exam_chapter_pool: toChapterPool(assignment.exam_chapter_pool),
    max_points: toNumber(assignment.max_points, 100),
    due_date: assignment.due_date ? String(assignment.due_date) : null,
    course_id: String(assignment.course_id),
    teacher_id: course?.teacher_id ? String(course.teacher_id) : null,
    is_proctored: Boolean(assignment.is_proctored) || normalizeAssignmentType(assignment.assignment_type) === 'exam',
    exam_duration_minutes:
      assignment.exam_duration_minutes === null || assignment.exam_duration_minutes === undefined
        ? null
        : Math.floor(toNumber(assignment.exam_duration_minutes, 0)),
    proctoring_policy: assignment.proctoring_policy || null,
  }
}

const assertExamAssignment = (assignment: AssignmentContext): void => {
  const type = assignment.assignment_type
  if (type !== 'exam' && type !== 'quiz' && !assignment.is_proctored) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'This endpoint is only available for exam and quiz assignments',
      400
    )
  }
}

const assertTeacherOrAdminAccess = (
  assignment: AssignmentContext,
  userId: string,
  userRole: UserRole
): void => {
  if (userRole === UserRole.ADMIN) {
    return
  }

  if (userRole === UserRole.TEACHER && assignment.teacher_id === userId) {
    return
  }

  throw new ApiError(ErrorCode.FORBIDDEN, 'You can only manage exams for your own course', 403)
}

const assertStudentEnrollment = async (assignment: AssignmentContext, studentId: string): Promise<void> => {
  const enrollmentStatus = await enrollmentService.getEnrollmentStatusForUser(assignment.course_id, studentId)

  if (!enrollmentStatus.enrolled) {
    throw new ApiError(
      ErrorCode.FORBIDDEN,
      'You must be enrolled in this course to take the exam',
      403
    )
  }
}

const mulberry32 = (seed: number): (() => number) => {
  let t = seed >>> 0

  return () => {
    t += 0x6d2b79f5
    let next = t
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const fisherYatesOrder = (length: number, random: () => number): number[] => {
  const order = Array.from({ length }, (_value, index) => index)

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const temp = order[i]
    order[i] = order[j]
    order[j] = temp
  }

  return order
}

export const deterministicIndexOrder = (length: number, seed: number): number[] => {
  return fisherYatesOrder(length, mulberry32(seed))
}

const sanitizeChoiceOrder = (order: number[] | undefined, choiceCount: number): number[] => {
  if (!order || !order.length) {
    return Array.from({ length: choiceCount }, (_value, index) => index)
  }

  const uniqueValid = Array.from(
    new Set(order.filter((index) => Number.isInteger(index) && index >= 0 && index < choiceCount))
  )

  if (uniqueValid.length !== choiceCount) {
    return Array.from({ length: choiceCount }, (_value, index) => index)
  }

  return uniqueValid
}

const buildRenderedQuestions = (
  questions: ExamQuestion[],
  questionOrder: string[],
  choiceOrders: Record<string, number[]>
): ExamQuestionForAttempt[] => {
  const questionById = new Map<string, ExamQuestion>()
  questions.forEach((question) => {
    questionById.set(question.id, question)
  })

  const normalizedQuestionOrder = questionOrder.length > 0
    ? questionOrder.filter((questionId) => questionById.has(questionId))
    : questions.map((question) => question.id)

  const renderedQuestions: ExamQuestionForAttempt[] = []

  for (const questionId of normalizedQuestionOrder) {
    const question = questionById.get(questionId)
    if (!question) {
      continue
    }

    const validChoiceOrder = sanitizeChoiceOrder(choiceOrders[question.id], question.choices.length)

    renderedQuestions.push({
      id: question.id,
      prompt: question.prompt,
      item_type: question.item_type,
      answer_payload: question.answer_payload,
      points: question.points,
      explanation: question.explanation,
      choices: validChoiceOrder.map((choiceIndex, renderedIndex) => ({
        rendered_index: renderedIndex,
        original_index: choiceIndex,
        text: question.choices[choiceIndex],
      })),
    })
  }

  return renderedQuestions
}

const listQuestionsForAssignment = async (assignmentId: string): Promise<ExamQuestion[]> => {
  const { data, error } = await supabaseAdmin
    .from('exam_questions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('Failed to load exam questions', { assignmentId, error: error.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load exam questions', 500)
  }

  return (data || []).map((row) => parseExamQuestion(row as Record<string, unknown>))
}

const getActiveAttempt = async (
  assignmentId: string,
  studentId: string
): Promise<ExamAttempt | null> => {
  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('Failed to load active exam attempt', {
      assignmentId,
      studentId,
      error: error.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load exam attempt', 500)
  }

  if (!data) {
    return null
  }

  return parseExamAttempt(data as Record<string, unknown>)
}

const buildAttemptSession = async (
  assignment: AssignmentContext,
  attempt: ExamAttempt
): Promise<ExamAttemptSession> => {
  const questions = await listQuestionsForAssignment(assignment.id)

  return {
    attempt,
    assignment: {
      id: assignment.id,
      title: assignment.title,
      max_points: assignment.max_points,
      due_date: assignment.due_date,
      exam_duration_minutes: assignment.exam_duration_minutes,
      is_proctored: assignment.is_proctored,
    },
    policy: toPolicy(assignment.proctoring_policy),
    questions: buildRenderedQuestions(
      questions,
      attempt.rendered_question_order,
      attempt.rendered_choice_orders
    ),
  }
}

const resolveAttemptContext = async (attemptId: string): Promise<AttemptContext> => {
  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .single()

  if (error || !data) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Exam attempt not found', 404)
  }

  const attempt = parseExamAttempt(data as Record<string, unknown>)
  const assignment = await getAssignmentContext(attempt.assignment_id)

  return {
    attempt,
    assignment,
  }
}

const assertAttemptAccess = (
  context: AttemptContext,
  userId: string,
  userRole: UserRole
): void => {
  if (userRole === UserRole.ADMIN) {
    return
  }

  if (userRole === UserRole.TEACHER && context.assignment.teacher_id === userId) {
    return
  }

  if (userRole === UserRole.STUDENT && context.attempt.student_id === userId) {
    return
  }

  throw new ApiError(ErrorCode.FORBIDDEN, 'You are not allowed to access this exam attempt', 403)
}

const normalizeExamQuestionWritePayload = (
  input: Partial<CreateExamQuestionInput>,
  existingQuestion?: ExamQuestion
): {
  item_type: ExamQuestionItemType
  choices: string[]
  correct_choice_index: number
  answer_payload: Record<string, unknown>
  chapter_tag: string | null
} => {
  const itemType = normalizeExamQuestionItemType(input.item_type ?? existingQuestion?.item_type)
  const chapterTagInput = input.chapter_tag
  const chapterTag = chapterTagInput === undefined
    ? (existingQuestion?.chapter_tag ?? null)
    : (chapterTagInput || null)

  let choices = input.choices !== undefined
    ? toChoiceArray(input.choices)
    : (existingQuestion?.choices || [])
  let correctChoiceIndex = input.correct_choice_index !== undefined
    ? Math.floor(input.correct_choice_index)
    : (existingQuestion?.correct_choice_index ?? 0)

  let answerPayload = input.answer_payload !== undefined
    ? toRecord(input.answer_payload)
    : (existingQuestion?.answer_payload || {})

  if (itemType === 'short_answer') {
    choices = []
    correctChoiceIndex = 0
  }

  if (itemType === 'true_false') {
    if (choices.length !== 2) {
      choices = ['True', 'False']
    }

    if (correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
      correctChoiceIndex = 0
    }
  }

  return {
    item_type: itemType,
    choices,
    correct_choice_index: correctChoiceIndex,
    answer_payload: answerPayload,
    chapter_tag: chapterTag,
  }
}

const selectQuestionSubset = (
  source: ExamQuestion[],
  requestedCount: number,
  mode: 'sequence' | 'random',
  random: () => number
): ExamQuestion[] => {
  if (requestedCount >= source.length) {
    return [...source]
  }

  if (mode === 'random') {
    const indexes = fisherYatesOrder(source.length, random).slice(0, requestedCount)
    return indexes.map((index) => source[index])
  }

  return source.slice(0, requestedCount)
}

const resolveQuestionsForAttempt = (
  questions: ExamQuestion[],
  assignment: AssignmentContext,
  random: () => number
): ExamQuestion[] => {
  const chapterPool = assignment.exam_chapter_pool

  if (!chapterPool.enabled || chapterPool.chapters.length === 0) {
    return questions
  }

  const selectedQuestions: ExamQuestion[] = []
  const selectedQuestionIds = new Set<string>()

  for (const chapterRule of chapterPool.chapters) {
    const wantedTag = chapterRule.tag.trim().toLowerCase()
    if (!wantedTag) {
      continue
    }

    const chapterQuestions = questions.filter(
      (question) => (question.chapter_tag || '').trim().toLowerCase() === wantedTag
    )

    if (chapterQuestions.length === 0) {
      continue
    }

    const takeCount = Math.min(chapterRule.take || chapterQuestions.length, chapterQuestions.length)
    const picked = selectQuestionSubset(
      chapterQuestions,
      takeCount,
      assignment.exam_question_selection_mode,
      random
    )

    for (const question of picked) {
      if (selectedQuestionIds.has(question.id)) {
        continue
      }

      selectedQuestionIds.add(question.id)
      selectedQuestions.push(question)
    }
  }

  const pooledQuestions = selectedQuestions.length > 0 ? selectedQuestions : questions

  if (
    chapterPool.total_questions
    && chapterPool.total_questions > 0
    && pooledQuestions.length > chapterPool.total_questions
  ) {
    return selectQuestionSubset(
      pooledQuestions,
      chapterPool.total_questions,
      assignment.exam_question_selection_mode,
      random
    )
  }

  return pooledQuestions
}

export const listExamQuestions = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole
): Promise<ExamQuestion[]> => {
  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  assertTeacherOrAdminAccess(assignment, userId, userRole)
  return listQuestionsForAssignment(assignmentId)
}

export const createExamQuestion = async (
  assignmentId: string,
  input: CreateExamQuestionInput,
  userId: string,
  userRole: UserRole
): Promise<ExamQuestion> => {
  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  assertTeacherOrAdminAccess(assignment, userId, userRole)

  const normalizedInput = normalizeExamQuestionWritePayload(input)

  let insertPayload: Record<string, unknown> = {
    assignment_id: assignmentId,
    prompt: input.prompt,
    item_type: normalizedInput.item_type,
    answer_payload: normalizedInput.answer_payload,
    chapter_tag: normalizedInput.chapter_tag,
    choices: normalizedInput.choices,
    correct_choice_index: normalizedInput.correct_choice_index,
    points: input.points,
    explanation: input.explanation || null,
    order_index: input.order_index || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('exam_questions')
      .insert(insertPayload)
      .select('*')
      .single()

    if (!error && data) {
      return parseExamQuestion(data as Record<string, unknown>)
    }

    const missingColumn = extractMissingColumnName(error)
    if (
      missingColumn
      && EXAM_QUESTION_COMPAT_OPTIONAL_COLUMNS.has(missingColumn)
      && Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)
    ) {
      delete insertPayload[missingColumn]

      logger.warn('Retrying exam question create without optional column', {
        assignmentId,
        userId,
        missingColumn,
        attempt: attempt + 1,
        error: error?.message,
      })

      continue
    }

    logger.error('Failed to create exam question', {
      assignmentId,
      userId,
      error: error?.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create exam question', 500)
  }

  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create exam question', 500)
}

export const updateExamQuestion = async (
  assignmentId: string,
  questionId: string,
  input: Partial<CreateExamQuestionInput>,
  userId: string,
  userRole: UserRole
): Promise<ExamQuestion> => {
  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  assertTeacherOrAdminAccess(assignment, userId, userRole)

  const { data: existingQuestionData, error: existingQuestionError } = await supabaseAdmin
    .from('exam_questions')
    .select('*')
    .eq('id', questionId)
    .eq('assignment_id', assignmentId)
    .single()

  if (existingQuestionError || !existingQuestionData) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Exam question not found', 404)
  }

  const existingQuestion = parseExamQuestion(existingQuestionData as Record<string, unknown>)
  const normalizedInput = normalizeExamQuestionWritePayload(input, existingQuestion)

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (input.prompt !== undefined) updatePayload.prompt = input.prompt
  if (input.item_type !== undefined) updatePayload.item_type = normalizedInput.item_type
  if (input.choices !== undefined || input.item_type !== undefined) updatePayload.choices = normalizedInput.choices
  if (input.correct_choice_index !== undefined || input.item_type !== undefined) {
    updatePayload.correct_choice_index = normalizedInput.correct_choice_index
  }
  if (input.answer_payload !== undefined || input.item_type !== undefined) {
    updatePayload.answer_payload = normalizedInput.answer_payload
  }
  if (input.chapter_tag !== undefined) updatePayload.chapter_tag = normalizedInput.chapter_tag
  if (input.points !== undefined) updatePayload.points = input.points
  if (input.explanation !== undefined) updatePayload.explanation = input.explanation || null
  if (input.order_index !== undefined) updatePayload.order_index = input.order_index

  let mutableUpdatePayload: Record<string, unknown> = {
    ...updatePayload,
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('exam_questions')
      .update(mutableUpdatePayload)
      .eq('id', questionId)
      .eq('assignment_id', assignmentId)
      .select('*')
      .single()

    if (!error && data) {
      return parseExamQuestion(data as Record<string, unknown>)
    }

    const missingColumn = extractMissingColumnName(error)
    if (
      missingColumn
      && EXAM_QUESTION_COMPAT_OPTIONAL_COLUMNS.has(missingColumn)
      && Object.prototype.hasOwnProperty.call(mutableUpdatePayload, missingColumn)
    ) {
      delete mutableUpdatePayload[missingColumn]

      logger.warn('Retrying exam question update without optional column', {
        assignmentId,
        questionId,
        userId,
        missingColumn,
        attempt: attempt + 1,
        error: error?.message,
      })

      continue
    }

    logger.error('Failed to update exam question', {
      assignmentId,
      questionId,
      userId,
      error: error?.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update exam question', 500)
  }

  throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update exam question', 500)
}

export const deleteExamQuestion = async (
  assignmentId: string,
  questionId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  assertTeacherOrAdminAccess(assignment, userId, userRole)

  const { error } = await supabaseAdmin
    .from('exam_questions')
    .delete()
    .eq('id', questionId)
    .eq('assignment_id', assignmentId)

  if (error) {
    logger.error('Failed to delete exam question', {
      assignmentId,
      questionId,
      userId,
      error: error.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete exam question', 500)
  }
}

export const startExamAttempt = async (
  assignmentId: string,
  input: StartExamAttemptInput,
  userId: string,
  userRole: UserRole
): Promise<ExamAttemptSession> => {
  if (userRole !== UserRole.STUDENT) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Only students can start exam attempts', 403)
  }

  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  await assertStudentEnrollment(assignment, userId)

  const resumeActiveAttempt = input.resume_active_attempt !== false
  if (resumeActiveAttempt) {
    const activeAttempt = await getActiveAttempt(assignmentId, userId)
    if (activeAttempt) {
      return buildAttemptSession(assignment, activeAttempt)
    }
  }

  const questions = await listQuestionsForAssignment(assignmentId)
  if (questions.length === 0) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'This exam has no questions yet. Please contact your teacher.',
      400
    )
  }

  const seed = crypto.randomInt(1, 2_147_483_646)
  const random = mulberry32(seed)

  const selectedQuestions = resolveQuestionsForAttempt(questions, assignment, random)
  if (selectedQuestions.length === 0) {
    throw new ApiError(
      ErrorCode.VALIDATION_ERROR,
      'No questions matched the configured exam chapter pool.',
      400
    )
  }

  const questionOrderIndexes = assignment.question_order_mode === 'random'
    ? fisherYatesOrder(selectedQuestions.length, random)
    : Array.from({ length: selectedQuestions.length }, (_value, index) => index)
  const questionOrder = questionOrderIndexes.map((index) => selectedQuestions[index].id)

  const renderedChoiceOrders: Record<string, number[]> = {}
  for (const question of selectedQuestions) {
    renderedChoiceOrders[question.id] = question.choices.length > 0
      ? fisherYatesOrder(question.choices.length, random)
      : []
  }

  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .insert({
      assignment_id: assignmentId,
      student_id: userId,
      status: 'active',
      seed,
      rendered_question_order: questionOrder,
      rendered_choice_orders: renderedChoiceOrders,
      started_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()

  if (error || !data) {
    logger.error('Failed to start exam attempt', {
      assignmentId,
      userId,
      error: error?.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to start exam attempt', 500)
  }

  return buildAttemptSession(assignment, parseExamAttempt(data as Record<string, unknown>))
}

export const getExamAttemptSession = async (
  attemptId: string,
  userId: string,
  userRole: UserRole
): Promise<ExamAttemptSession> => {
  const context = await resolveAttemptContext(attemptId)
  assertAttemptAccess(context, userId, userRole)
  return buildAttemptSession(context.assignment, context.attempt)
}

export const submitExamAnswer = async (
  attemptId: string,
  input: SubmitExamAnswerInput,
  userId: string,
  userRole: UserRole
): Promise<{ attempt_id: string; question_id: string; is_correct: boolean | null; points_awarded: number }> => {
  const context = await resolveAttemptContext(attemptId)
  assertAttemptAccess(context, userId, userRole)

  if (userRole !== UserRole.STUDENT || context.attempt.student_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Only the attempt owner can submit answers', 403)
  }

  if (context.attempt.status !== 'active') {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Exam attempt is no longer active', 400)
  }

  const { data: questionData, error: questionError } = await supabaseAdmin
    .from('exam_questions')
    .select('*')
    .eq('id', input.question_id)
    .eq('assignment_id', context.assignment.id)
    .single()

  if (questionError || !questionData) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Exam question not found', 404)
  }

  const question = parseExamQuestion(questionData as Record<string, unknown>)

  let isCorrect: boolean | null = null
  let pointsAwarded = 0
  let upsertData: Record<string, unknown>

  if (question.item_type === 'short_answer') {
    const answerText = (input.answer_text ?? '').trim()
    const acceptedAnswers: string[] = Array.isArray(question.answer_payload?.accepted_answers)
      ? (question.answer_payload.accepted_answers as string[])
      : []

    if (acceptedAnswers.length > 0 && answerText) {
      const caseSensitive = Boolean(question.answer_payload?.case_sensitive)
      const normalized = caseSensitive ? answerText : answerText.toLowerCase()
      const normalizedAccepted = acceptedAnswers.map((a) => (caseSensitive ? a : a.toLowerCase()))
      isCorrect = normalizedAccepted.some((accepted) => normalized === accepted)
      pointsAwarded = isCorrect ? question.points : 0
    }

    upsertData = {
      attempt_id: attemptId,
      question_id: input.question_id,
      selected_choice_index: null,
      answer_text: answerText || null,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      answered_at: new Date().toISOString(),
    }
  } else {
    if (input.selected_choice_index === undefined || input.selected_choice_index === null) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, 'selected_choice_index is required for this question type', 400)
    }
    if (input.selected_choice_index < 0 || input.selected_choice_index >= question.choices.length) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Selected choice index is out of range', 400)
    }

    isCorrect = input.selected_choice_index === question.correct_choice_index
    pointsAwarded = isCorrect ? question.points : 0

    upsertData = {
      attempt_id: attemptId,
      question_id: input.question_id,
      selected_choice_index: input.selected_choice_index,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      answered_at: new Date().toISOString(),
    }
  }

  const { error: upsertError } = await supabaseAdmin
    .from('exam_attempt_answers')
    .upsert(upsertData, { onConflict: 'attempt_id,question_id' })

  if (upsertError) {
    logger.error('Failed to save exam answer', {
      attemptId,
      questionId: input.question_id,
      userId,
      error: upsertError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to save answer', 500)
  }

  return {
    attempt_id: attemptId,
    question_id: input.question_id,
    is_correct: isCorrect,
    points_awarded: pointsAwarded,
  }
}

export const reportExamViolation = async (
  attemptId: string,
  input: ReportExamViolationInput,
  userId: string,
  userRole: UserRole
): Promise<ReportExamViolationResult> => {
  const context = await resolveAttemptContext(attemptId)
  assertAttemptAccess(context, userId, userRole)

  if (userRole !== UserRole.STUDENT || context.attempt.student_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Only the attempt owner can report violations', 403)
  }

  if (context.attempt.status !== 'active') {
    return {
      attempt_status: context.attempt.status,
      violation_count: 0,
      terminated: context.attempt.status === 'terminated',
      auto_submitted: false,
    }
  }

  const now = new Date().toISOString()

  const { error: violationError } = await supabaseAdmin
    .from('exam_violations')
    .insert({
      attempt_id: attemptId,
      assignment_id: context.assignment.id,
      student_id: context.attempt.student_id,
      violation_type: input.violation_type,
      metadata: input.metadata || {},
      created_at: now,
    })

  if (violationError) {
    logger.error('Failed to report exam violation', {
      attemptId,
      userId,
      violationType: input.violation_type,
      error: violationError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to report violation', 500)
  }

  const { count, error: countError } = await supabaseAdmin
    .from('exam_violations')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', attemptId)

  if (countError) {
    logger.error('Failed to count exam violations', {
      attemptId,
      error: countError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update violation count', 500)
  }

  const violationCount = count || 0
  const policy = toPolicy(context.assignment.proctoring_policy)

  const hardFullscreenTrigger =
    input.violation_type === 'fullscreen_exit'
    && (policy.auto_submit_on_fullscreen_exit || policy.terminate_on_fullscreen_exit)
  const hardTabSwitchTrigger =
    input.violation_type === 'visibility_hidden'
    && policy.auto_submit_on_tab_switch
  const hardPolicyTrigger = hardFullscreenTrigger || hardTabSwitchTrigger

  const shouldTerminate =
    hardPolicyTrigger
    || violationCount >= policy.max_violations

  if (!shouldTerminate) {
    return {
      attempt_status: 'active',
      violation_count: violationCount,
      terminated: false,
      auto_submitted: false,
    }
  }

  const { error: terminateError } = await supabaseAdmin
    .from('exam_attempts')
    .update({
      status: 'terminated',
      ended_at: now,
      updated_at: now,
    })
    .eq('id', attemptId)

  if (terminateError) {
    logger.error('Failed to terminate exam attempt after violation threshold', {
      attemptId,
      userId,
      error: terminateError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to terminate exam attempt', 500)
  }

  if (hardPolicyTrigger && examHardPolicyAutoSubmitEnabled) {
    const submissionResult = await submitExamAttempt(attemptId, userId, userRole)

    return {
      attempt_status: 'submitted',
      violation_count: violationCount,
      terminated: true,
      auto_submitted: true,
      submission_result: submissionResult,
    }
  }

  return {
    attempt_status: 'terminated',
    violation_count: violationCount,
    terminated: true,
    auto_submitted: false,
  }
}

export const listAttemptViolations = async (
  attemptId: string,
  userId: string,
  userRole: UserRole,
  query: ListViolationsQuery
): Promise<{ violations: ExamViolation[]; total: number }> => {
  const context = await resolveAttemptContext(attemptId)
  assertAttemptAccess(context, userId, userRole)

  const { data, error, count } = await supabaseAdmin
    .from('exam_violations')
    .select('*', { count: 'exact' })
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1)

  if (error) {
    logger.error('Failed to list exam attempt violations', {
      attemptId,
      userId,
      error: error.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load exam violations', 500)
  }

  return {
    violations: (data || []) as ExamViolation[],
    total: count || 0,
  }
}

export const listAssignmentViolations = async (
  assignmentId: string,
  userId: string,
  userRole: UserRole,
  query: ListViolationsQuery
): Promise<{ violations: ExamViolation[]; total: number }> => {
  const assignment = await getAssignmentContext(assignmentId)
  assertExamAssignment(assignment)
  assertTeacherOrAdminAccess(assignment, userId, userRole)

  const { data, error, count } = await supabaseAdmin
    .from('exam_violations')
    .select('*', { count: 'exact' })
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1)

  if (error) {
    logger.error('Failed to list assignment exam violations', {
      assignmentId,
      userId,
      error: error.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load exam violations', 500)
  }

  return {
    violations: (data || []) as ExamViolation[],
    total: count || 0,
  }
}

export const submitExamAttempt = async (
  attemptId: string,
  userId: string,
  userRole: UserRole
): Promise<ExamSubmissionResult> => {
  const context = await resolveAttemptContext(attemptId)
  assertAttemptAccess(context, userId, userRole)

  if (userRole !== UserRole.STUDENT || context.attempt.student_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Only the attempt owner can submit this exam', 403)
  }

  if (context.attempt.status === 'submitted') {
    throw new ApiError(ErrorCode.CONFLICT, 'Exam attempt has already been submitted', 409)
  }

  if (!['active', 'terminated', 'timed_out'].includes(context.attempt.status)) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Exam attempt cannot be submitted', 400)
  }

  const questions = await listQuestionsForAssignment(context.assignment.id)
  const totalQuestions = questions.length

  if (totalQuestions === 0) {
    throw new ApiError(ErrorCode.VALIDATION_ERROR, 'Exam has no questions configured', 400)
  }

  const { data: answersData, error: answersError } = await supabaseAdmin
    .from('exam_attempt_answers')
    .select('*')
    .eq('attempt_id', attemptId)

  if (answersError) {
    logger.error('Failed to load attempt answers for exam submission', {
      attemptId,
      userId,
      error: answersError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to submit exam attempt', 500)
  }

  const answeredCount = (answersData || []).length
  const rawScore = roundToTwo(
    (answersData || []).reduce((sum, answer) => sum + toNumber(answer.points_awarded, 0), 0)
  )
  const totalQuestionPoints = roundToTwo(questions.reduce((sum, question) => sum + question.points, 0))

  const scaledScore = totalQuestionPoints > 0
    ? roundToTwo((rawScore / totalQuestionPoints) * context.assignment.max_points)
    : 0

  const percentage = context.assignment.max_points > 0
    ? roundToTwo((scaledScore / context.assignment.max_points) * 100)
    : 0

  const { data: violationsData, error: violationsError } = await supabaseAdmin
    .from('exam_violations')
    .select('id, violation_type, created_at')
    .eq('attempt_id', attemptId)

  if (violationsError) {
    logger.error('Failed to load exam violations while submitting attempt', {
      attemptId,
      error: violationsError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to submit exam attempt', 500)
  }

  const violationCount = (violationsData || []).length
  const antiCheatViolations = (violationsData || []).map((violation) => ({
    id: violation.id,
    type: violation.violation_type,
    created_at: violation.created_at,
  }))

  const now = new Date().toISOString()
  const dueDate = context.assignment.due_date ? new Date(context.assignment.due_date) : null
  const isLate = dueDate ? new Date(now) > dueDate : false
  const submissionStatus = isLate ? 'late' : 'submitted'

  const { data: existingSubmission, error: submissionLookupError } = await supabaseAdmin
    .from('submissions')
    .select('id')
    .eq('assignment_id', context.assignment.id)
    .eq('student_id', context.attempt.student_id)
    .maybeSingle()

  if (submissionLookupError) {
    logger.error('Failed to lookup submission during exam finalization', {
      attemptId,
      error: submissionLookupError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to submit exam attempt', 500)
  }

  const submissionContent = JSON.stringify({
    attempt_id: attemptId,
    answered_count: answeredCount,
    total_questions: totalQuestions,
    raw_score: rawScore,
    max_question_score: totalQuestionPoints,
    scaled_score: scaledScore,
    violation_count: violationCount,
  })

  let submissionId: string

  const isMissingColumn = (err: { code?: string; message?: string } | null, column: string): boolean => {
    if (!err) return false
    const text = (err.message || '').toLowerCase()
    if (!text.includes(column.toLowerCase())) return false
    // PostgreSQL: undefined_column (raw SQL error)
    if (err.code === '42703') return true
    // PostgREST: schema cache miss ("Could not find the 'X' column of 'Y' in the schema cache")
    if (err.code === 'PGRST204') return true
    if (text.includes('could not find') && text.includes('column')) return true
    if (text.includes('schema cache')) return true
    return false
  }

  type SubmissionWrite = {
    content: string
    submitted_at: string
    status: string
    is_proctored?: boolean
    anti_cheat_violations?: typeof antiCheatViolations
    assignment_id?: string
    student_id?: string
  }

  const buildWritePayload = (forInsert: boolean): SubmissionWrite => {
    const payload: SubmissionWrite = {
      content: submissionContent,
      submitted_at: now,
      status: submissionStatus,
      is_proctored: context.assignment.is_proctored,
      anti_cheat_violations: antiCheatViolations,
    }
    if (forInsert) {
      payload.assignment_id = context.assignment.id
      payload.student_id = context.attempt.student_id
    }
    return payload
  }

  if (existingSubmission?.id) {
    let payload = buildWritePayload(false)
    let { error: submissionUpdateError } = await supabaseAdmin
      .from('submissions')
      .update(payload)
      .eq('id', existingSubmission.id)

    if (submissionUpdateError && isMissingColumn(submissionUpdateError, 'anti_cheat_violations')) {
      logger.warn('submissions.anti_cheat_violations missing; retrying update without it', { attemptId })
      delete payload.anti_cheat_violations
      ;({ error: submissionUpdateError } = await supabaseAdmin
        .from('submissions')
        .update(payload)
        .eq('id', existingSubmission.id))
    }

    if (submissionUpdateError && isMissingColumn(submissionUpdateError, 'is_proctored')) {
      logger.warn('submissions.is_proctored missing; retrying update without it', { attemptId })
      delete payload.is_proctored
      ;({ error: submissionUpdateError } = await supabaseAdmin
        .from('submissions')
        .update(payload)
        .eq('id', existingSubmission.id))
    }

    if (submissionUpdateError) {
      logger.error('Failed to update existing exam submission', {
        attemptId,
        submissionId: existingSubmission.id,
        error: submissionUpdateError.message,
        code: submissionUpdateError.code,
      })
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to finalize exam submission: ${submissionUpdateError.message}`,
        500
      )
    }

    submissionId = existingSubmission.id
  } else {
    let payload = buildWritePayload(true)
    let { data: createdSubmission, error: submissionCreateError } = await supabaseAdmin
      .from('submissions')
      .insert(payload)
      .select('id')
      .single()

    if (submissionCreateError && isMissingColumn(submissionCreateError, 'anti_cheat_violations')) {
      logger.warn('submissions.anti_cheat_violations missing; retrying insert without it', { attemptId })
      delete payload.anti_cheat_violations
      ;({ data: createdSubmission, error: submissionCreateError } = await supabaseAdmin
        .from('submissions')
        .insert(payload)
        .select('id')
        .single())
    }

    if (submissionCreateError && isMissingColumn(submissionCreateError, 'is_proctored')) {
      logger.warn('submissions.is_proctored missing; retrying insert without it', { attemptId })
      delete payload.is_proctored
      ;({ data: createdSubmission, error: submissionCreateError } = await supabaseAdmin
        .from('submissions')
        .insert(payload)
        .select('id')
        .single())
    }

    if (submissionCreateError || !createdSubmission) {
      logger.error('Failed to create exam submission', {
        attemptId,
        error: submissionCreateError?.message,
        code: submissionCreateError?.code,
      })
      throw new ApiError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to finalize exam submission: ${submissionCreateError?.message || 'unknown error'}`,
        500
      )
    }

    submissionId = String(createdSubmission.id)
  }

  const graderId = context.assignment.teacher_id || userId
  const graderRole = context.assignment.teacher_id ? UserRole.TEACHER : UserRole.ADMIN
  const autoFeedback = `Auto-graded exam attempt. Answered ${answeredCount}/${totalQuestions} questions. Violations: ${violationCount}.`

  const { data: existingGrade, error: existingGradeError } = await supabaseAdmin
    .from('grades')
    .select('id')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (existingGradeError) {
    logger.error('Failed to lookup grade during exam finalization', {
      attemptId,
      submissionId,
      error: existingGradeError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to finalize exam submission', 500)
  }

  let gradeId: string

  if (existingGrade?.id) {
    const updatedGrade = await updateGrade(
      String(existingGrade.id),
      {
        points_earned: scaledScore,
        feedback: autoFeedback,
      },
      graderId,
      graderRole
    )

    gradeId = updatedGrade.id
  } else {
    const createdGrade = await createGrade(
      {
        submission_id: submissionId,
        points_earned: scaledScore,
        feedback: autoFeedback,
      },
      graderId,
      graderRole
    )

    gradeId = createdGrade.id
  }

  const { error: attemptUpdateError } = await supabaseAdmin
    .from('exam_attempts')
    .update({
      status: 'submitted',
      submitted_at: now,
      ended_at: now,
      updated_at: now,
    })
    .eq('id', attemptId)

  if (attemptUpdateError) {
    logger.error('Failed to update attempt status to submitted', {
      attemptId,
      error: attemptUpdateError.message,
    })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to finalize exam attempt', 500)
  }

  const answerByQuestionId = new Map(
    (answersData || []).map((a) => [a.question_id as string, a])
  )

  const questionResults: ExamQuestionResult[] = questions.map((question) => {
    const answer = answerByQuestionId.get(question.id)
    const acceptedAnswers: string[] = Array.isArray(question.answer_payload?.accepted_answers)
      ? (question.answer_payload.accepted_answers as string[])
      : []
    const correctAnswerText = acceptedAnswers.length > 0 ? acceptedAnswers[0] : null

    return {
      question_id: question.id,
      prompt: question.prompt,
      item_type: question.item_type,
      points_possible: question.points,
      points_awarded: answer ? roundToTwo(toNumber(answer.points_awarded, 0)) : 0,
      is_correct: answer ? (answer.is_correct as boolean | null) : null,
      selected_choice_index: answer ? (answer.selected_choice_index as number | null) : null,
      answer_text: answer ? (answer.answer_text as string | null) : null,
      correct_choice_index: question.item_type !== 'short_answer' ? question.correct_choice_index : null,
      correct_answer_text: correctAnswerText,
      choices: question.choices,
      explanation: question.explanation,
    }
  })

  return {
    attempt_id: attemptId,
    submission_id: submissionId,
    grade_id: gradeId,
    score: scaledScore,
    max_score: context.assignment.max_points,
    percentage,
    answered_count: answeredCount,
    total_questions: totalQuestions,
    violation_count: violationCount,
    question_results: questionResults,
  }
}
