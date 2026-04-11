import { apiClient } from './api-client';
import {
  createSubmissionSyncKey,
  enqueueSubmission,
} from './submission-queue.service';

export interface AssignmentData {
  title: string;
  description?: string;
  due_date: string;
  max_points: number;
  assignment_type?: 'exam' | 'quiz' | 'activity';
  instructions?: string;
}

export interface SubmissionData {
  drive_file_id?: string;
  drive_file_name?: string;
  content?: string;
  submission_text?: string;
  submission_url?: string;
  attachments?: File[];
  sync_key?: string;
}

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'late'
  | 'under_review'
  | 'graded';

export interface SubmissionStatusTimelineEntry {
  id: string;
  submission_id: string;
  from_status: SubmissionStatus | null;
  to_status: SubmissionStatus;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: string;
  } | null;
}

export interface SubmissionResult {
  queued: boolean;
  sync_key?: string;
  data?: any;
  message?: string;
}

interface SubmitAssignmentOptions {
  skipQueue?: boolean;
}

const buildSubmissionContent = (data: SubmissionData): string | undefined => {
  return data.content || data.submission_text || data.submission_url || undefined;
};

const buildSubmissionPayload = (data: SubmissionData, syncKey: string) => {
  return {
    drive_file_id: data.drive_file_id,
    drive_file_name: data.drive_file_name,
    content: buildSubmissionContent(data),
    sync_key: syncKey,
  };
};

const shouldQueueOnError = (error: any): boolean => {
  return !error?.response;
};

const isOffline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

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

  async submitAssignment(
    courseId: string,
    assignmentId: string,
    data: SubmissionData,
    options: SubmitAssignmentOptions = {}
  ): Promise<SubmissionResult> {
    if (!data.drive_file_id || !data.drive_file_name) {
      throw new Error('A Drive file is required before submitting an assignment.');
    }

    const syncKey = data.sync_key || createSubmissionSyncKey();
    const payload = buildSubmissionPayload(data, syncKey);

    if (!options.skipQueue && isOffline()) {
      const queuedItem = enqueueSubmission({
        courseId,
        assignmentId,
        payload,
      });

      return {
        queued: true,
        sync_key: queuedItem.syncKey,
        message: 'Submission queued and will sync when your connection returns.',
      };
    }

    try {
      const response = await apiClient.post(`/assignments/${assignmentId}/submit`, payload);
      return {
        queued: false,
        sync_key: syncKey,
        data: response,
      };
    } catch (error: any) {
      if (!options.skipQueue && shouldQueueOnError(error)) {
        const queuedItem = enqueueSubmission({
          courseId,
          assignmentId,
          payload,
        });

        return {
          queued: true,
          sync_key: queuedItem.syncKey,
          message: 'Network issue detected. Submission was queued for automatic sync.',
        };
      }

      throw error;
    }
  },

  async getSubmissions(courseId: string, assignmentId: string) {
    return apiClient.get(`/assignments/${assignmentId}/submissions`);
  },

  async getMySubmission(courseId: string, assignmentId: string) {
    return apiClient.get(`/assignments/${assignmentId}/my-submission`);
  },

  async transitionSubmissionStatus(
    submissionId: string,
    status: SubmissionStatus,
    reason?: string
  ) {
    return apiClient.patch(`/assignments/submissions/${submissionId}/status`, {
      status,
      reason,
    });
  },

  async requestSubmissionRevision(submissionId: string, reason: string) {
    return apiClient.post(`/assignments/submissions/${submissionId}/request-revision`, {
      reason,
    });
  },

  async getSubmissionTimeline(submissionId: string) {
    return apiClient.get(`/assignments/submissions/${submissionId}/timeline`);
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
