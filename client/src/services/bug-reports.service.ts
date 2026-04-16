import { apiClient } from './api-client'

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical'
export type BugReportStatus = 'open' | 'in_review' | 'resolved' | 'closed'

export interface CreateBugReportPayload {
  reporter_name: string
  reporter_email: string
  reporter_role?: 'student' | 'teacher' | 'admin' | 'parent' | 'guest' | 'other'
  title: string
  description: string
  steps_to_reproduce?: string
  expected_result?: string
  actual_result?: string
  page_url: string
  browser_info?: string
  severity?: BugReportSeverity
}

export interface BugReport {
  id: string
  reporter_user_id?: string | null
  reporter_name: string
  reporter_email: string
  reporter_role?: string | null
  title: string
  description: string
  steps_to_reproduce?: string | null
  expected_result?: string | null
  actual_result?: string | null
  page_url?: string | null
  browser_info?: string | null
  severity: BugReportSeverity
  status: BugReportStatus
  admin_notes?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  created_at: string
  updated_at: string
}

export interface BugReportsListResponse {
  reports: BugReport[]
  total: number
  limit: number
  offset: number
}

const unwrapApiData = <T>(response: any): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data as T
  }
  return response as T
}

export const bugReportsService = {
  async submit(payload: CreateBugReportPayload): Promise<{ report_id: string; message: string }> {
    const response = await apiClient.post('/bug-reports', payload)
    return unwrapApiData<{ report_id: string; message: string }>(response)
  },

  async list(params?: {
    status?: BugReportStatus | 'all'
    severity?: BugReportSeverity | 'all'
    limit?: number
    offset?: number
  }): Promise<BugReportsListResponse> {
    const response = await apiClient.get('/admin/bug-reports', { params })
    return unwrapApiData<BugReportsListResponse>(response)
  },

  async updateStatus(
    id: string,
    payload: { status: BugReportStatus; admin_notes?: string }
  ): Promise<BugReport> {
    const response = await apiClient.patch(`/admin/bug-reports/${id}/status`, payload)
    return unwrapApiData<BugReport>(response)
  },
}
