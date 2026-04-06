import { apiClient } from './api-client';

export interface CourseData {
  title: string;
  description?: string;
  section?: string;
  room?: string;
  schedule?: string;
  cover_image?: string;
}

export const coursesService = {
  async getCourses(params?: { archived?: boolean; role?: 'student' | 'teacher' }) {
    const queryParams = new URLSearchParams();
    if (params?.archived !== undefined) {
      queryParams.append('archived', params.archived.toString());
    }
    if (params?.role) {
      queryParams.append('role', params.role);
    }
    return apiClient.get(`/courses?${queryParams.toString()}`);
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
