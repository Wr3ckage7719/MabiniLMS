import { apiClient } from './api-client';

export interface AssignmentData {
  title: string;
  description?: string;
  due_date: string;
  max_points: number;
  assignment_type?: 'homework' | 'quiz' | 'project' | 'discussion';
  instructions?: string;
}

export interface SubmissionData {
  submission_text?: string;
  submission_url?: string;
  attachments?: File[];
}

export const assignmentsService = {
  async getAssignments(courseId: string) {
    return apiClient.get(`/courses/${courseId}/assignments`);
  },

  async getAssignmentById(courseId: string, assignmentId: string) {
    return apiClient.get(`/courses/${courseId}/assignments/${assignmentId}`);
  },

  async createAssignment(courseId: string, data: AssignmentData) {
    return apiClient.post(`/courses/${courseId}/assignments`, data);
  },

  async updateAssignment(courseId: string, assignmentId: string, data: Partial<AssignmentData>) {
    return apiClient.patch(`/courses/${courseId}/assignments/${assignmentId}`, data);
  },

  async deleteAssignment(courseId: string, assignmentId: string) {
    return apiClient.delete(`/courses/${courseId}/assignments/${assignmentId}`);
  },

  async submitAssignment(courseId: string, assignmentId: string, data: SubmissionData) {
    return apiClient.post(`/courses/${courseId}/assignments/${assignmentId}/submit`, data);
  },

  async getSubmissions(courseId: string, assignmentId: string) {
    return apiClient.get(`/courses/${courseId}/assignments/${assignmentId}/submissions`);
  },

  async getMySubmission(courseId: string, assignmentId: string) {
    return apiClient.get(`/courses/${courseId}/assignments/${assignmentId}/my-submission`);
  },

  async gradeSubmission(courseId: string, assignmentId: string, submissionId: string, grade: number, feedback?: string) {
    return apiClient.patch(`/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`, {
      grade,
      feedback,
    });
  },
};
