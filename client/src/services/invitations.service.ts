import { apiClient } from './api-client';

export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface ClassInvitation {
  id: string;
  course_id: string;
  invited_by: string;
  student_email: string;
  student_id: string | null;
  status: InvitationStatus;
  sent_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    title: string;
    teacher_id: string;
  } | null;
}

export const invitationsService = {
  createInvitation(courseId: string, studentEmail: string) {
    return apiClient.post('/invitations', {
      course_id: courseId,
      student_email: studentEmail,
    });
  },

  listMyInvitations(params?: { status?: InvitationStatus; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (typeof params?.limit === 'number') query.append('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.append('offset', String(params.offset));

    const queryString = query.toString();
    return apiClient.get(`/invitations/my${queryString ? `?${queryString}` : ''}`);
  },

  listCourseInvitations(
    courseId: string,
    params?: { status?: InvitationStatus; limit?: number; offset?: number }
  ) {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (typeof params?.limit === 'number') query.append('limit', String(params.limit));
    if (typeof params?.offset === 'number') query.append('offset', String(params.offset));

    const queryString = query.toString();
    return apiClient.get(`/invitations/course/${courseId}${queryString ? `?${queryString}` : ''}`);
  },

  acceptInvitation(invitationId: string) {
    return apiClient.post(`/invitations/${invitationId}/accept`);
  },

  declineInvitation(invitationId: string) {
    return apiClient.post(`/invitations/${invitationId}/decline`);
  },
};
