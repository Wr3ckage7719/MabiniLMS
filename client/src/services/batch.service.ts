import { apiClient } from './api-client';

export const batchService = {
  bulkEnroll(courseId: string, studentIds: string[], sendNotifications: boolean = true) {
    return apiClient.post('/batch/enroll', {
      course_id: courseId,
      student_ids: studentIds,
      send_notifications: sendNotifications,
    });
  },

  bulkUnenroll(courseId: string, studentIds: string[]) {
    return apiClient.post('/batch/unenroll', {
      course_id: courseId,
      student_ids: studentIds,
    });
  },

  exportGrades(courseId: string) {
    return apiClient.get(`/batch/export-grades/${courseId}`);
  },

  importStudents(students: Array<{ email: string; first_name: string; last_name: string; role?: 'student' | 'teacher' }>) {
    return apiClient.post('/batch/import-students', { students });
  },

  copyCourse(courseId: string, newTitle: string) {
    return apiClient.post(`/batch/copy-course/${courseId}`, { new_title: newTitle });
  },
};
