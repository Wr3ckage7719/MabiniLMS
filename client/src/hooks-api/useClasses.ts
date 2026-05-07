import { keepPreviousData, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { coursesService } from '@/services/courses.service';
import { transformCourses, transformAssignments, transformMaterials, transformUsers } from '@/services/data-transformer';
import { toDisplayAnnouncement } from './useAnnouncements';
import { ClassItem } from '@/lib/data';
import { useAuth } from '@/contexts/AuthContext';

export function useClasses(params?: { archived?: boolean; role?: 'student' | 'teacher' }): UseQueryResult<ClassItem[], Error> {
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['classes', user?.id || null, params],
    queryFn: async () => {
      const response = await coursesService.getCourses({
        ...params,
        includeEnrollmentCount: true,
        limit: 100,
      });
      return transformCourses(response.data?.courses || []);
    },
    enabled: !authLoading && isLoggedIn,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useClassDashboard(classId: string): UseQueryResult<any, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['class-dashboard', classId],
    queryFn: async () => {
      const response = await coursesService.getCourseDashboard(classId);
      const data = response.data;
      // Prime individual caches with transformed data so legacy sub-hooks get instant hits
      if (data) {
        if (data.assignments) queryClient.setQueryData(['assignments', classId], transformAssignments(data.assignments));
        if (data.announcements) queryClient.setQueryData(['announcements', classId], data.announcements.map(toDisplayAnnouncement));
        if (data.materials) queryClient.setQueryData(['materials', classId], transformMaterials(data.materials));
        if (data.students) queryClient.setQueryData(['students', classId], transformUsers(data.students));
        if (data.grades) queryClient.setQueryData(['my-grades', classId], data.grades);
        if (data.weighted_grade) queryClient.setQueryData(['weighted-course-grade', classId, 'me'], data.weighted_grade);
      }
      return data;
    },
    enabled: !authLoading && isLoggedIn && !!classId,
    staleTime: 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  });
}

export function useClass(classId: string): UseQueryResult<ClassItem, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['class', classId],
    queryFn: async () => {
      const response = await coursesService.getCourseById(classId);
      return transformCourses([response.data])[0];
    },
    enabled: !authLoading && isLoggedIn && !!classId,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 2 * 60 * 1000,
  });
}
