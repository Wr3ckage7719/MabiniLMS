/**
 * Teacher Dashboard Hooks
 * 
 * Custom React hooks for fetching and managing teacher-related data.
 * Provides loading states, error handling, and automatic data refresh.
 */

import { useState, useEffect, useCallback } from 'react';
import { teacherService, TeacherCourse, CourseStudent, Submission, TeacherAssignment, Notification } from '@/services/teacher.service';

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

  const fetchCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await teacherService.getTeacherCourses(options);
      setCourses(response.data || []);
    } catch (err: any) {
      console.error('Error fetching teacher courses:', err);
      setError(err.response?.data?.message || 'Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [options?.status, options?.includeEnrollmentCount]);

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
}

export function useNotifications(options?: UseNotificationsOptions): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [notifRes, countRes] = await Promise.all([
        teacherService.getNotifications({
          unread_only: options?.unreadOnly,
          limit: options?.limit,
        }),
        teacherService.getNotificationCount(),
      ]);
      
      setNotifications(notifRes.data || []);
      setUnreadCount(countRes.unread || 0);
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
      setError(err.response?.data?.message || 'Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [options?.unreadOnly, options?.limit]);

  useEffect(() => {
    fetchNotifications();
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

  return { 
    notifications, 
    unreadCount, 
    loading, 
    error, 
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
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
  const [data, setData] = useState<TeacherDashboardData>({
    courses: [],
    totalStudents: 0,
    recentSubmissions: [],
    upcomingDeadlines: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get teacher's published courses
      const coursesRes = await teacherService.getTeacherCourses({ 
        status: 'published',
        includeEnrollmentCount: true,
      });
      const courses = coursesRes.data || [];

      // Calculate total students
      const totalStudents = courses.reduce((sum, c) => sum + (c.enrollment_count || 0), 0);

      // Fetch assignments and submissions for each course
      const allAssignments: TeacherAssignment[] = [];
      const allSubmissions: Submission[] = [];

      for (const course of courses.slice(0, 5)) { // Limit to prevent too many requests
        try {
          const assignmentsRes = await teacherService.getCourseAssignments(course.id);
          const assignments = assignmentsRes.data || [];
          allAssignments.push(...assignments);

          // Fetch submissions for recent assignments
          for (const assignment of assignments.slice(0, 3)) {
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
              // Continue on error
            }
          }
        } catch (e) {
          // Continue on error
        }
      }

      // Filter upcoming deadlines (next 7 days)
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const upcomingDeadlines = allAssignments
        .filter(a => {
          if (!a.due_date) return false;
          const dueDate = new Date(a.due_date);
          return dueDate > now && dueDate <= weekFromNow;
        })
        .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
        .slice(0, 5);

      // Sort submissions by date and take recent ones
      const recentSubmissions = allSubmissions
        .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
        .slice(0, 5);

      setData({
        courses,
        totalStudents,
        recentSubmissions,
        upcomingDeadlines,
      });
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return { data, loading, error, refetch: fetchDashboard };
}
