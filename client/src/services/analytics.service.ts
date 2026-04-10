import { apiClient } from './api-client';

export const analyticsService = {
  getMyAnalytics() {
    return apiClient.get('/analytics/me');
  },

  getPlatformAnalytics() {
    return apiClient.get('/analytics/platform');
  },

  getCourseAnalytics(courseId: string) {
    return apiClient.get(`/analytics/courses/${courseId}`);
  },

  getStudentAnalytics(studentId: string) {
    return apiClient.get(`/analytics/students/${studentId}`);
  },

  getTeacherAnalytics(teacherId: string) {
    return apiClient.get(`/analytics/teachers/${teacherId}`);
  },
};
