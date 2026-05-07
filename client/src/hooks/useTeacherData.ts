/**
 * Teacher Dashboard Hooks
 * 
 * Custom React hooks for fetching and managing teacher-related data.
 * Provides loading states, error handling, and automatic data refresh.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { teacherService, TeacherCourse, CourseStudent, Submission, TeacherAssignment, Notification } from '@/services/teacher.service';
import { notificationsService } from '@/services/notifications.service';
import { coursesService } from '@/services/courses.service';

// ============================================
// useTeacherCourses - Fetch teacher's courses
// ============================================

export interface UseTeacherCoursesOptions {
  status?: 'draft' | 'published' | 'archived';
  includeEnrollmentCount?: boolean;
}

export interface UseTeacherCoursesResult {
  courses: TeacherCourse[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTeacherCourses(options?: UseTeacherCoursesOptions): UseTeacherCoursesResult {
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const status = options?.status;
  const includeEnrollmentCount = options?.includeEnrollmentCount;

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await teacherService.getTeacherCourses({
        status,
        includeEnrollmentCount,
      });
      setCourses(response.data || []);
    } catch (err: any) {
      console.error('Error fetching teacher courses:', err);
      setError(err.response?.data?.message || 'Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [status, includeEnrollmentCount]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return { courses, loading, error, refetch: fetchCourses };
}

// ============================================
// useCourseRoster - Fetch enrolled students
// ============================================

export interface UseCourseRosterResult {
  students: CourseStudent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCourseRoster(courseId: string | null): UseCourseRosterResult {
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    if (!courseId) {
      setStudents([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await teacherService.getCourseRoster(courseId);
      setStudents(response.data || []);
    } catch (err: any) {
      console.error('Error fetching course roster:', err);
      setError(err.response?.data?.message || 'Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  return { students, loading, error, refetch: fetchRoster };
}

// ============================================
// useCourseAssignments - Fetch course assignments
// ============================================

export interface UseCourseAssignmentsResult {
  assignments: TeacherAssignment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCourseAssignments(courseId: string | null): UseCourseAssignmentsResult {
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    if (!courseId) {
      setAssignments([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await teacherService.getCourseAssignments(courseId);
      setAssignments(response.data || []);
    } catch (err: any) {
      console.error('Error fetching assignments:', err);
      setError(err.response?.data?.message || 'Failed to load assignments');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return { assignments, loading, error, refetch: fetchAssignments };
}

// ============================================
// useAssignmentSubmissions - Fetch submissions for an assignment
// ============================================

export interface UseAssignmentSubmissionsResult {
  submissions: Submission[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAssignmentSubmissions(assignmentId: string | null): UseAssignmentSubmissionsResult {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!assignmentId) {
      setSubmissions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await teacherService.getAssignmentSubmissions(assignmentId);
      setSubmissions(response.data || []);
    } catch (err: any) {
      console.error('Error fetching submissions:', err);
      setError(err.response?.data?.message || 'Failed to load submissions');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  return { submissions, loading, error, refetch: fetchSubmissions };
}

// ============================================
// useCourseSubmissions - Fetch all submissions for a course
// ============================================

export interface UseCourseSubmissionsResult {
  submissions: Submission[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCourseSubmissions(courseId: string | null): UseCourseSubmissionsResult {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!courseId) {
      setSubmissions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // First get all assignments for this course
      const assignmentsRes = await teacherService.getCourseAssignments(courseId);
      const assignments = assignmentsRes.data || [];
      
      // Then fetch submissions for each assignment
      const allSubmissions: Submission[] = [];
      for (const assignment of assignments) {
        try {
          const subRes = await teacherService.getAssignmentSubmissions(assignment.id);
          const subs = (subRes.data || []).map(s => ({
            ...s,
            assignment: {
              id: assignment.id,
              title: assignment.title,
              due_date: assignment.due_date,
              max_points: assignment.max_points,
              course_id: assignment.course_id,
            },
          }));
          allSubmissions.push(...subs);
        } catch (e) {
          // Continue if one assignment fails
          console.warn(`Failed to fetch submissions for assignment ${assignment.id}`);
        }
      }
      
      // Sort by submission date (most recent first)
      allSubmissions.sort((a, b) => 
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );
      
      setSubmissions(allSubmissions);
    } catch (err: any) {
      console.error('Error fetching course submissions:', err);
      setError(err.response?.data?.message || 'Failed to load submissions');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  return { submissions, loading, error, refetch: fetchSubmissions };
}

// ============================================
// useNotifications - Fetch user notifications
// ============================================

export interface UseNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  deleteAllRead: () => Promise<void>;
}

export function useNotifications(options?: UseNotificationsOptions): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [notificationsResult, countResult] = await Promise.allSettled([
      teacherService.getNotifications({
        unread_only: options?.unreadOnly,
        limit: options?.limit,
      }),
      teacherService.getNotificationCount(),
    ]);

    let nextError: string | null = null;

    if (notificationsResult.status === 'fulfilled') {
      const nextNotifications = notificationsResult.value.data || [];
      setNotifications(nextNotifications);

      if (countResult.status === 'fulfilled') {
        setUnreadCount(countResult.value.unread || 0);
      } else {
        console.error('Error fetching notification count:', countResult.reason);
        setUnreadCount(nextNotifications.filter((notification) => !notification.read).length);
        nextError =
          countResult.reason?.response?.data?.message ||
          countResult.reason?.message ||
          'Notification count is temporarily unavailable';
      }
    } else {
      console.error('Error fetching notifications:', notificationsResult.reason);
      nextError =
        notificationsResult.reason?.response?.data?.message ||
        notificationsResult.reason?.message ||
        'Failed to load notifications';

      // Keep the previous notification list visible when refresh fails.
      if (countResult.status === 'fulfilled') {
        setUnreadCount(countResult.value.unread || 0);
      } else {
        console.error('Error fetching notification count:', countResult.reason);
      }
    }

    setError(nextError);
    setLoading(false);
  }, [options?.unreadOnly, options?.limit]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleRealtimeRefresh = () => {
      void fetchNotifications();
    };

    window.addEventListener('mabini:notifications-refresh', handleRealtimeRefresh);

    return () => {
      window.removeEventListener('mabini:notifications-refresh', handleRealtimeRefresh);
    };
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (ids: string[]) => {
    try {
      await teacherService.markNotificationsAsRead(ids);
      setNotifications(prev => 
        prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - ids.length));
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await teacherService.markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  }, []);

  const deleteOne = useCallback(async (id: string) => {
    try {
      await notificationsService.deleteOne(id);
      setNotifications(prev => {
        const removed = prev.find(n => n.id === id);
        if (removed && !removed.read) {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return prev.filter(n => n.id !== id);
      });
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  }, []);

  const deleteAllRead = useCallback(async () => {
    try {
      await notificationsService.deleteRead();
      setNotifications(prev => prev.filter(n => !n.read));
    } catch (err) {
      console.error('Error deleting read notifications:', err);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteOne,
    deleteAllRead,
  };
}

// ============================================
// useTeacherDashboard - Combined dashboard data
// ============================================

export interface TeacherDashboardData {
  courses: TeacherCourse[];
  totalStudents: number;
  recentSubmissions: Submission[];
  upcomingDeadlines: TeacherAssignment[];
}

export interface UseTeacherDashboardResult {
  data: TeacherDashboardData;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTeacherDashboard(): UseTeacherDashboardResult {
  const { data: raw, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ['teacher-dashboard-summary'],
    queryFn: async () => {
      const res = await coursesService.getTeacherDashboardSummary();
      return res.data;
    },
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  });

  const data: TeacherDashboardData = {
    courses: (raw?.courses || []) as TeacherCourse[],
    totalStudents: raw?.total_students ?? 0,
    recentSubmissions: (raw?.recent_submissions || []).map((s: any) => ({
      id: s.id,
      submitted_at: s.submitted_at,
      status: s.status,
      student_id: s.student_id,
      assignment_id: s.assignment_id,
      grade: s.grade ?? null,
      assignment: {
        id: s.assignment_id,
        title: s.assignment_title,
        due_date: '',
        max_points: 0,
        course_id: s.course_id,
      },
    })) as Submission[],
    upcomingDeadlines: (raw?.upcoming_deadlines || []) as TeacherAssignment[],
  };

  const error = queryError
    ? ((queryError as any)?.response?.data?.message || 'Failed to load dashboard')
    : null;

  return {
    data,
    loading: isLoading,
    error,
    refetch: async () => { await refetch(); },
  };
}
