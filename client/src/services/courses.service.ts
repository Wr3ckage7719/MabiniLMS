import { apiClient } from './api-client';

export type CourseCompletionPolicy =
  | { type: 'all_items_viewed' }
  | { type: 'passing_score_on'; assignment_id: string; threshold: number }
  | { type: 'weighted_score_threshold'; threshold: number };

export interface CourseCategoryWeights {
  exam: number;
  quiz: number;
  activity: number;
  recitation: number;
  attendance: number;
  project: number;
}

export interface CourseData {
  title: string;
  description?: string;
  syllabus?: string;
  status?: 'draft' | 'published' | 'archived';
  section?: string;
  room?: string;
  schedule?: string;
  cover_image?: string;
  tags?: string[];
  completion_policy?: CourseCompletionPolicy | null;
  category_weights?: CourseCategoryWeights | null;
  enrolment_key?: string | null;
}

export const coursesService = {
  async getCourses(params?: {
    archived?: boolean;
    role?: 'student' | 'teacher';
    includeEnrollmentCount?: boolean;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();

    // Backend supports status filtering; use archived=true as explicit archived status filter.
    if (params?.archived === true) {
      queryParams.append('status', 'archived');
    }

    // Most dashboard and class list views render student counts from enrollment_count.
    // Requesting this by default avoids silent zero-count regressions.
    if (params?.includeEnrollmentCount !== false) {
      queryParams.append('include_enrollment_count', 'true');
    }

    // Backend defaults to 10 rows; request a safer page size for class list views.
    queryParams.append('limit', String(params?.limit || 100));

    const queryString = queryParams.toString();
    return apiClient.get(`/courses${queryString ? `?${queryString}` : ''}`);
  },

  async getCourseById(id: string) {
    return apiClient.get(`/courses/${id}`);
  },

  async createCourse(data: CourseData) {
    return apiClient.post('/courses', data);
  },

  async updateCourse(id: string, data: Partial<CourseData>) {
    return apiClient.patch(`/courses/${id}`, data);
  },

  async deleteCourse(id: string) {
    return apiClient.delete(`/courses/${id}`);
  },

  async archiveCourse(id: string) {
    return apiClient.patch(`/courses/${id}/archive`, {});
  },

  async unarchiveCourse(id: string) {
    return apiClient.patch(`/courses/${id}/unarchive`, {});
  },

  async getCourseStudents(courseId: string) {
    return apiClient.get(`/courses/${courseId}/students`);
  },

  async getCourseTeachers(courseId: string) {
    return apiClient.get(`/courses/${courseId}/teachers`);
  },

  async getCourseInsights(courseId: string) {
    return apiClient.get(`/courses/${courseId}/insights`);
  },
};

export interface PerStudentInsight {
  student: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  last_active_at: string | null;
  submissions_total: number;
  submissions_graded: number;
  assignments_outstanding: number;
  materials_viewed: number;
  materials_total: number;
  avg_grade_percent: number | null;
  at_risk: boolean;
}

export interface ClassRollupInsight {
  student_count: number;
  assignment_count: number;
  material_count: number;
  avg_completion_percent: number;
  at_risk_count: number;
  grade_distribution: Array<{ range: string; count: number }>;
}

export interface CourseInsightsPayload {
  course_id: string;
  generated_at: string;
  per_student: PerStudentInsight[];
  class_rollup: ClassRollupInsight;
}
