import { apiClient } from './api-client';

export const enrollmentsService = {
  async enrollInCourse(courseId: string) {
    return apiClient.post('/enrollments', { course_id: courseId });
  },

  async unenrollFromCourse(enrollmentId: string) {
    return apiClient.delete(`/enrollments/${enrollmentId}`);
  },

  async getEnrollments(params?: { course_id?: string; user_id?: string }) {
    const queryParams = new URLSearchParams();
    if (params?.course_id) {
      queryParams.append('course_id', params.course_id);
    }
    if (params?.user_id) {
      queryParams.append('user_id', params.user_id);
    }
    return apiClient.get(`/enrollments?${queryParams.toString()}`);
  },

  async getEnrollmentStatus(courseId: string) {
    return apiClient.get(`/enrollments/course/${courseId}/status`);
  },

  async getMyCourses() {
    return apiClient.get('/enrollments/my-courses');
  },
};
