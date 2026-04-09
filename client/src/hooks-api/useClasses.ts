import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { coursesService } from '@/services/courses.service';
import { transformCourses } from '@/services/data-transformer';
import { ClassItem } from '@/lib/data';
import { useAuth } from '@/contexts/AuthContext';

export function useClasses(params?: { archived?: boolean; role?: 'student' | 'teacher' }): UseQueryResult<ClassItem[], Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['classes', params],
    queryFn: async () => {
      const response = await coursesService.getCourses(params);
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
    refetchOnReconnect: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useClass(classId: string): UseQueryResult<ClassItem, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['class', classId],
    queryFn: async () => {
      const response = await coursesService.getCourseById(classId);
      return transformCourses([response.data?.course])[0];
    },
    enabled: !authLoading && isLoggedIn && !!classId,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        return false;
      }
      return failureCount < 1;
    },
    refetchOnReconnect: false,
  });
}
