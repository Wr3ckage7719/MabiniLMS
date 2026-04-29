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

  exportRegistrarGrades(courseId: string) {
    return apiClient.get<string>(`/batch/export-registrar/${courseId}`, { responseType: 'text' });
  },

  /**
   * Mabini Colleges registrar workbook (.xlsx) — full 5-sheet layout that
   * mirrors TTH 1-2_30PM.xlsx (the official registrar format).
   */
  exportRegistrarWorkbook(courseId: string) {
    return apiClient.get<Blob>(`/batch/export-registrar-xlsx/${courseId}`, { responseType: 'blob' });
  },

  exportMyGrade(courseId: string) {
    return apiClient.get<string>(`/batch/export-my-grade/${courseId}`, { responseType: 'text' });
  },

  /**
   * Student self-export of the registrar workbook, scoped to the
   * authenticated student's row only.
   */
  exportMyGradeWorkbook(courseId: string) {
    return apiClient.get<Blob>(`/batch/export-my-grade-xlsx/${courseId}`, { responseType: 'blob' });
  },

  importStudents(students: Array<{ email: string; first_name: string; last_name: string; role?: 'student' | 'teacher' }>) {
    return apiClient.post('/batch/import-students', { students });
  },

  copyCourse(courseId: string, newTitle: string) {
    return apiClient.post(`/batch/copy-course/${courseId}`, { new_title: newTitle });
  },
};
