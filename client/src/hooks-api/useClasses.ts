import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { coursesService } from '@/services/courses.service';
import { transformCourses } from '@/services/data-transformer';
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
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 2 * 60 * 1000,
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
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 2 * 60 * 1000,
  });
}
