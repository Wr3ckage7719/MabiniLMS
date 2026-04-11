import { NextFunction, Response } from 'express'
import { AuthRequest, UserRole } from '../types/index.js'
import * as examService from '../services/exams.js'
import {
  CreateExamQuestionInput,
  ListViolationsQuery,
  ReportExamViolationInput,
  StartExamAttemptInput,
  SubmitExamAnswerInput,
} from '../types/exams.js'

export const listExamQuestions = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params
    const questions = await examService.listExamQuestions(
      assignmentId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: questions,
    })
  } catch (error) {
    next(error)
  }
}

export const createExamQuestion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params
    const input = req.body as CreateExamQuestionInput

    const question = await examService.createExamQuestion(
      assignmentId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.status(201).json({
      success: true,
      data: question,
    })
  } catch (error) {
    next(error)
  }
}

export const updateExamQuestion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId, questionId } = req.params

    const question = await examService.updateExamQuestion(
      assignmentId,
      questionId,
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: question,
    })
  } catch (error) {
    next(error)
  }
}

export const deleteExamQuestion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId, questionId } = req.params

    await examService.deleteExamQuestion(
      assignmentId,
      questionId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: {
        message: 'Exam question deleted successfully',
      },
    })
  } catch (error) {
    next(error)
  }
}

export const startExamAttempt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params
    const input = (req.body || {}) as StartExamAttemptInput

    const session = await examService.startExamAttempt(
      assignmentId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.status(201).json({
      success: true,
      data: session,
    })
  } catch (error) {
    next(error)
  }
}

export const getExamAttemptSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params

    const session = await examService.getExamAttemptSession(
      attemptId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: session,
    })
  } catch (error) {
    next(error)
  }
}

export const submitExamAnswer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params
    const input = req.body as SubmitExamAnswerInput

    const answer = await examService.submitExamAnswer(
      attemptId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: answer,
    })
  } catch (error) {
    next(error)
  }
}

export const reportExamViolation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params
    const input = req.body as ReportExamViolationInput

    const result = await examService.reportExamViolation(
      attemptId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export const submitExamAttempt = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params

    const result = await examService.submitExamAttempt(
      attemptId,
      req.user!.id,
      req.user!.role as UserRole
    )

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export const listAttemptViolations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { attemptId } = req.params
    const query = req.query as unknown as ListViolationsQuery

    const result = await examService.listAttemptViolations(
      attemptId,
      req.user!.id,
      req.user!.role as UserRole,
      query
    )

    res.json({
      success: true,
      data: result.violations,
      meta: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const listAssignmentViolations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assignmentId } = req.params
    const query = req.query as unknown as ListViolationsQuery

    const result = await examService.listAssignmentViolations(
      assignmentId,
      req.user!.id,
      req.user!.role as UserRole,
      query
    )

    res.json({
      success: true,
      data: result.violations,
      meta: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    })
  } catch (error) {
    next(error)
  }
}
