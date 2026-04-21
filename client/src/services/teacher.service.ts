/**
 * Teacher-specific API service
 * 
 * Provides methods for teacher dashboard functionality including:
 * - Course management (teacher's own courses)
 * - Submissions overview
 * - Course roster/students
 * - Announcements (if API exists)
 * - Dashboard statistics
 */

import { apiClient } from './api-client';

const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

export interface TeacherCourse {
  id: string;
  title: string;
  description: string | null;
  section: string | null;
  room: string | null;
  schedule: string | null;
  cover_image: string | null;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  teacher_id: string;
  enrollment_count?: number;
}

export interface CourseStudent {
  id: string;
  student_id: string;
  course_id: string;
  status: 'active' | 'completed' | 'dropped';
  enrolled_at: string;
  student?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export interface SubmissionStorageConsistencyIssue {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  fallback_applied: boolean;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  drive_view_link: string | null;
  drive_file_name: string | null;
  drive_file_id?: string | null;
  file_url?: string | null;
  storage_provider?: 'google_drive' | string | null;
  provider_file_id?: string | null;
  provider_file_name?: string | null;
  provider_view_link?: string | null;
  provider_revision_id?: string | null;
  provider_mime_type?: string | null;
  provider_size_bytes?: number | null;
  provider_checksum?: string | null;
  submission_snapshot_at?: string | null;
  storage_metadata_complete?: boolean;
  storage_consistency_issues?: SubmissionStorageConsistencyIssue[];
  submission_text: string | null;
  submission_url: string | null;
  submitted_at: string;
  status: 'draft' | 'submitted' | 'late' | 'under_review' | 'graded' | 'returned';
  grade?: {
    id: string;
    points_earned: number;
    feedback: string | null;
    graded_at: string;
  } | null;
  student: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  assignment?: {
    id: string;
    title: string;
    due_date: string | null;
    max_points: number;
    course_id: string;
  };
}

export interface TeacherAssignment {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  max_points: number;
  created_at: string;
  submission_count?: number;
  graded_count?: number;
}

export interface Announcement {
  id: string;
  course_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  read: boolean;
  action_url?: string | null;
  created_at: string;
  metadata?: Record<string, any> | null;
  data?: Record<string, any>;
}

export interface DashboardStats {
  totalCourses: number;
  totalStudents: number;
  pendingSubmissions: number;
  recentSubmissions: Submission[];
  upcomingDeadlines: TeacherAssignment[];
}

export const teacherService = {
  /**
   * Get all courses for the current teacher
   */
  async getTeacherCourses(options?: { 
    status?: 'draft' | 'published' | 'archived';
    includeEnrollmentCount?: boolean;
    limit?: number;
  }): Promise<{ data: TeacherCourse[] }> {
    const params = new URLSearchParams();
    if (options?.status) {
      params.append('status', options.status);
    }
    if (options?.includeEnrollmentCount) {
      params.append('include_enrollment_count', 'true');
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    const query = params.toString();
    const response = await apiClient.get(`/courses${query ? `?${query}` : ''}`);

    return {
      data: toArray<TeacherCourse>(response?.data?.courses),
    };
  },

  /**
   * Get course roster (enrolled students)
   */
  async getCourseRoster(courseId: string): Promise<{ data: CourseStudent[] }> {
    const response = await apiClient.get(`/courses/${courseId}/roster`);
    return {
      data: toArray<CourseStudent>(response?.data),
    };
  },

  /**
   * Get all assignments for a course
   */
  async getCourseAssignments(courseId: string): Promise<{ data: TeacherAssignment[] }> {
    const response = await apiClient.get(`/assignments?course_id=${courseId}&include_past=true&limit=100`);
    return {
      data: toArray<TeacherAssignment>(response?.data),
    };
  },

  /**
   * Get submissions for a specific assignment
   */
  async getAssignmentSubmissions(assignmentId: string): Promise<{ data: Submission[] }> {
    const response = await apiClient.get(`/assignments/${assignmentId}/submissions`);
    return {
      data: toArray<Submission>(response?.data),
    };
  },

  /**
   * Get all submissions across all teacher's courses (for dashboard)
   */
  async getAllSubmissions(options?: {
    limit?: number;
    status?: 'submitted' | 'graded' | 'returned';
    courseId?: string;
  }): Promise<{ data: Submission[] }> {
    const assignmentQuery = options?.courseId
      ? `/assignments?course_id=${options.courseId}&include_past=true&limit=100`
      : '/assignments?include_past=true&limit=100';

    const assignmentsResponse = await apiClient.get(assignmentQuery);
    const assignments: Array<{ id: string }> = toArray(assignmentsResponse?.data);

    const allSubmissions = await Promise.all(
      assignments.map(async (assignment) => {
        try {
          const submissionResponse = await apiClient.get(`/assignments/${assignment.id}/submissions`);
          return toArray<Submission>(submissionResponse?.data);
        } catch {
          return [];
        }
      })
    );

    let submissions = allSubmissions.flat();

    if (options?.status) {
      submissions = submissions.filter((submission: Submission) => submission.status === options.status);
    }

    if (options?.limit) {
      submissions = submissions.slice(0, options.limit);
    }

    return { data: submissions };
  },

  /**
   * Grade a submission
   */
  async gradeSubmission(submissionId: string, data: {
    points_earned: number;
    feedback?: string;
  }): Promise<{ data: any }> {
    return apiClient.post(`/grades`, {
      submission_id: submissionId,
      ...data,
    });
  },

  /**
   * Get notifications for the current user
   */
  async getNotifications(options?: {
    unread_only?: boolean;
    limit?: number;
  }): Promise<{ data: Notification[] }> {
    const params = new URLSearchParams();
    if (options?.unread_only) {
      params.append('read', 'false');
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }

    const query = params.toString();
    const response = await apiClient.get(`/notifications${query ? `?${query}` : ''}`);
    return {
      data: toArray<Notification>(response?.data),
    };
  },

  /**
   * Get notification count
   */
  async getNotificationCount(): Promise<{ total: number; unread: number }> {
    const response = await apiClient.get('/notifications/count');
    return response?.data || { total: 0, unread: 0 };
  },

  /**
   * Mark notifications as read
   */
  async markNotificationsAsRead(notificationIds: string[]): Promise<void> {
    return apiClient.post('/notifications/mark-read', { notification_ids: notificationIds });
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead(): Promise<void> {
    return apiClient.post('/notifications/mark-all-read');
  },

  /**
   * Get course materials
   */
  async getCourseMaterials(courseId: string): Promise<{ data: any[] }> {
    const response = await apiClient.get(`/courses/${courseId}/materials`);
    return {
      data: toArray<any>(response?.data),
    };
  },

  /**
   * Create announcement (if API exists)
   * Note: Falls back gracefully if endpoint doesn't exist
   */
  async createAnnouncement(courseId: string, content: string): Promise<{ data: Announcement }> {
    const title = content.trim().slice(0, 80) || 'Announcement';
    const response = await apiClient.post(`/courses/${courseId}/announcements`, { title, content });
    return {
      data: response?.data as Announcement,
    };
  },

  /**
   * Get announcements for a course (if API exists)
   */
  async getAnnouncements(courseId: string): Promise<{ data: Announcement[] }> {
    const response = await apiClient.get(`/courses/${courseId}/announcements`);
    return {
      data: toArray<Announcement>(response?.data),
    };
  },

  /**
   * Get dashboard statistics for the teacher
   * This aggregates data from multiple endpoints
   */
  async getDashboardStats(): Promise<DashboardStats> {
    // Fetch courses and assignments in parallel
    const [coursesRes] = await Promise.all([
      this.getTeacherCourses({ status: 'published', includeEnrollmentCount: true, limit: 100 }),
    ]);

    const courses = coursesRes.data || [];
    const totalStudents = courses.reduce((sum, c) => sum + (c.enrollment_count || 0), 0);

    return {
      totalCourses: courses.length,
      totalStudents,
      pendingSubmissions: 0, // Would need a separate endpoint
      recentSubmissions: [],
      upcomingDeadlines: [],
    };
  },
};
