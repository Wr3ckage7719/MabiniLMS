import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types/index.js'
import {
  CreateBugReportInput,
  ListBugReportsQuery,
  UpdateBugReportStatusInput,
} from '../types/bug-reports.js'
import * as bugReportsService from '../services/bug-reports.js'

export const submitBugReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: CreateBugReportInput = req.body
    const report = await bugReportsService.createBugReport(input)

    res.status(201).json({
      success: true,
      data: {
        message: 'Bug report submitted successfully',
        report_id: report.id,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const listBugReports = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const query = req.query as unknown as ListBugReportsQuery
    const result = await bugReportsService.listBugReports(query)

    res.json({
      success: true,
      data: {
        reports: result.reports,
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const updateBugReportStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const input: UpdateBugReportStatusInput = req.body

    const report = await bugReportsService.updateBugReportStatus(
      req.params.id,
      input,
      req.user!.id
    )

    res.json({
      success: true,
      data: report,
    })
  } catch (error) {
    next(error)
  }
}
