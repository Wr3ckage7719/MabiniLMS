import { apiClient } from './api-client';

export const gradesService = {
  async getMyGrades(courseId?: string) {
    const url = courseId ? `/grades/my-grades?course_id=${courseId}` : '/grades/my-grades';
    return apiClient.get(url);
  },

  async getCourseGrades(courseId: string) {
    return apiClient.get(`/courses/${courseId}/grades`);
  },

  async getStudentGrades(courseId: string, studentId: string) {
    return apiClient.get(`/courses/${courseId}/students/${studentId}/grades`);
  },

  async updateGrade(gradeId: string, data: { score?: number; feedback?: string }) {
    return apiClient.patch(`/grades/${gradeId}`, data);
  },

  async getGradeStatistics(courseId: string, assignmentId?: string) {
    const url = assignmentId 
      ? `/courses/${courseId}/grades/statistics?assignment_id=${assignmentId}`
      : `/courses/${courseId}/grades/statistics`;
    return apiClient.get(url);
  },
};
