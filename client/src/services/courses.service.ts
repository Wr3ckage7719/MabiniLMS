import { apiClient } from './api-client';

export interface CourseData {
  title: string;
  description?: string;
  syllabus?: string;
  status?: 'draft' | 'published' | 'archived';
  section?: string;
  room?: string;
  schedule?: string;
  cover_image?: string;
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
};
