import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { gradesService } from '@/services/grades.service';
import { useAuth } from '@/contexts/AuthContext';

// Main export - used by GradesPage
export function useGrades(courseId?: string) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['my-grades', courseId],
    queryFn: async () => {
      const response = await gradesService.getMyGrades(courseId);
      return response.data?.grades || [];
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
    staleTime: 2 * 60 * 1000,
  });
}

// Alias for backwards compatibility
export const useMyGrades = useGrades;

export function useCourseGrades(courseId: string) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['course-grades', courseId],
    queryFn: async () => {
      const response = await gradesService.getCourseGrades(courseId);
      return response.data?.grades || [];
    },
    enabled: !authLoading && isLoggedIn && !!courseId,
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

export function useStudentGrades(courseId: string, studentId: string) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['student-grades', courseId, studentId],
    queryFn: async () => {
      const response = await gradesService.getStudentGrades(courseId, studentId);
      return response.data?.grades || [];
    },
    enabled: !authLoading && isLoggedIn && !!courseId && !!studentId,
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
