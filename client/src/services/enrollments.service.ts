import { apiClient } from './api-client';

export const enrollmentsService = {
  async enrollInCourse(courseId: string) {
    return apiClient.post('/enrollments', { course_id: courseId });
  },

  async unenrollFromCourse(enrollmentId: string) {
    return apiClient.delete(`/enrollments/${enrollmentId}`);
  },

  async getEnrollments(params?: { course_id?: string; user_id?: string }) {
    if (params?.course_id) {
      return apiClient.get(`/courses/${params.course_id}/roster`);
    }

    return apiClient.get('/enrollments/my-courses');
  },

  async getEnrollmentStatus(courseId: string) {
    return apiClient.get(`/enrollments/course/${courseId}/status`);
  },

  async getMyCourses() {
    return apiClient.get('/enrollments/my-courses');
  },
};
