import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { createBugReportSchema } from '../types/bug-reports.js'
import * as bugReportsController from '../controllers/bug-reports.js'

const router = Router()

/**
 * POST /api/bug-reports - Submit a public bug report
 */
router.post(
  '/',
  validate({ body: createBugReportSchema }),
  bugReportsController.submitBugReport
)

export default router
