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
  drive_file_id?: string;
  drive_file_name?: string;
  content?: string;
  submission_text?: string;
  submission_url?: string;
  attachments?: File[];
}

export const assignmentsService = {
  async getAssignments(courseId: string) {
    const response = await apiClient.get(`/assignments?course_id=${courseId}&include_past=true`);
    return {
      data: {
        assignments: response?.data || [],
      },
      meta: response?.meta,
    };
  },

  async getAssignmentById(courseId: string, assignmentId: string) {
    const response = await apiClient.get(`/assignments/${assignmentId}`);
    return {
      data: {
        assignment: response?.data,
      },
    };
  },

  async createAssignment(courseId: string, data: AssignmentData) {
    return apiClient.post(`/assignments/courses/${courseId}/assignments`, data);
  },

  async updateAssignment(courseId: string, assignmentId: string, data: Partial<AssignmentData>) {
    return apiClient.patch(`/assignments/${assignmentId}`, data);
  },

  async deleteAssignment(courseId: string, assignmentId: string) {
    return apiClient.delete(`/assignments/${assignmentId}`);
  },

  async submitAssignment(courseId: string, assignmentId: string, data: SubmissionData) {
    const payload = {
      drive_file_id: data.drive_file_id,
      drive_file_name: data.drive_file_name,
      content:
        data.content ||
        data.submission_text ||
        data.submission_url ||
        undefined,
    };

    return apiClient.post(`/assignments/${assignmentId}/submit`, payload);
  },

  async getSubmissions(courseId: string, assignmentId: string) {
    return apiClient.get(`/assignments/${assignmentId}/submissions`);
  },

  async getMySubmission(courseId: string, assignmentId: string) {
    return apiClient.get(`/assignments/${assignmentId}/my-submission`);
  },

  async getComments(assignmentId: string) {
    return apiClient.get(`/assignments/${assignmentId}/comments`);
  },

  async createComment(assignmentId: string, content: string) {
    return apiClient.post(`/assignments/${assignmentId}/comments`, { content });
  },

  async gradeSubmission(courseId: string, assignmentId: string, submissionId: string, grade: number, feedback?: string) {
    return apiClient.post('/grades', {
      submission_id: submissionId,
      points_earned: grade,
      feedback,
    });
  },
};
