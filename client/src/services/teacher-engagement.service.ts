import { apiClient } from './api-client';

export interface MaterialEngagementSummaryRow {
  material_id: string;
  material_title: string;
  material_type: string | null;
  enrolled_students: number;
  students_started: number;
  students_completed: number;
  avg_progress_percent: number;
  total_downloads: number;
  last_activity_at: string | null;
}

export interface CourseMaterialEngagementSummary {
  course_id: string;
  generated_at: string;
  materials: MaterialEngagementSummaryRow[];
}

export interface ReadinessStudent {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface ReadinessStudentRow {
  student: ReadinessStudent;
  ready: boolean;
  satisfied_count: number;
  required_count: number;
  missing_material_ids: string[];
}

export interface AssessmentReadinessSummary {
  assignment_id: string;
  course_id: string;
  gating_enabled: boolean;
  required_count: number;
  ready_count: number;
  not_ready_count: number;
  students: ReadinessStudentRow[];
  generated_at: string;
}

const unwrap = <T,>(response: unknown): T | null => {
  if (!response || typeof response !== 'object') return null;
  const data = (response as { data?: unknown }).data;
  return (data as T) ?? null;
};

export const teacherEngagementService = {
  async getCourseMaterialEngagement(
    courseId: string
  ): Promise<CourseMaterialEngagementSummary | null> {
    const response = await apiClient.get(`/courses/${courseId}/material-engagement`);
    return unwrap<CourseMaterialEngagementSummary>(response);
  },

  async getAssessmentReadiness(
    assignmentId: string
  ): Promise<AssessmentReadinessSummary | null> {
    const response = await apiClient.get(`/assignments/${assignmentId}/readiness`);
    return unwrap<AssessmentReadinessSummary>(response);
  },
};
