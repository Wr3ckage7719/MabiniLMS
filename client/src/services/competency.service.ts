import { apiClient } from './api-client';

export type CompetencyStatus = 'competent' | 'in_progress' | 'not_yet_competent';

export interface StudentEvidenceContribution {
  evidence_id: string;
  artifact_kind: 'assignment' | 'material';
  artifact_id: string;
  artifact_title: string;
  weight: number;
  earned_fraction: number;
  detail: string;
}

export interface StudentUnitStatus {
  unit_id: string;
  code: string;
  title: string;
  threshold_percent: number;
  evidence_count: number;
  weighted_total: number;
  weighted_earned: number;
  percent_complete: number;
  status: CompetencyStatus;
  contributions: StudentEvidenceContribution[];
}

export interface StudentCourseCompetencySummary {
  course_id: string;
  student_id: string;
  units: StudentUnitStatus[];
  competent_count: number;
  in_progress_count: number;
  not_yet_competent_count: number;
}

export interface CompetencyUnit {
  id: string;
  course_id: string;
  code: string;
  title: string;
  description: string | null;
  threshold_percent: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UnitWithEvidence extends CompetencyUnit {
  evidence: Array<{
    id: string;
    unit_id: string;
    assignment_id: string | null;
    material_id: string | null;
    weight: number;
    assignment?: { id: string; title: string; max_points: number } | null;
    material?: { id: string; title: string; type: string | null } | null;
  }>;
}

export const competencyService = {
  async listUnits(courseId: string): Promise<UnitWithEvidence[]> {
    const response = await apiClient.get(`/competency/courses/${courseId}/units`);
    return (response?.data ?? []) as UnitWithEvidence[];
  },

  async getMySummary(courseId: string): Promise<StudentCourseCompetencySummary> {
    const response = await apiClient.get(`/competency/courses/${courseId}/me`);
    return response?.data as StudentCourseCompetencySummary;
  },

  async getStudentSummary(
    courseId: string,
    studentId: string
  ): Promise<StudentCourseCompetencySummary> {
    const response = await apiClient.get(
      `/competency/courses/${courseId}/students/${studentId}`
    );
    return response?.data as StudentCourseCompetencySummary;
  },

  async createUnit(
    courseId: string,
    payload: {
      code: string;
      title: string;
      description?: string | null;
      threshold_percent?: number;
      sort_order?: number;
    }
  ) {
    return apiClient.post(`/competency/courses/${courseId}/units`, payload);
  },

  async updateUnit(
    unitId: string,
    payload: Partial<{
      code: string;
      title: string;
      description: string | null;
      threshold_percent: number;
      sort_order: number;
    }>
  ) {
    return apiClient.patch(`/competency/units/${unitId}`, payload);
  },

  async deleteUnit(unitId: string) {
    return apiClient.delete(`/competency/units/${unitId}`);
  },

  async setEvidence(
    unitId: string,
    payload: { assignment_ids?: string[]; material_ids?: string[] }
  ) {
    return apiClient.put(`/competency/units/${unitId}/evidence`, payload);
  },
};
