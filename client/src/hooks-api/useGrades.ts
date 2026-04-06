import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { gradesService } from '@/services/grades.service';

// Main export - used by GradesPage
export function useGrades(courseId?: string) {
  return useQuery({
    queryKey: ['my-grades', courseId],
    queryFn: async () => {
      const response = await gradesService.getMyGrades(courseId);
      return response.data?.grades || [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Alias for backwards compatibility
export const useMyGrades = useGrades;

export function useCourseGrades(courseId: string) {
  return useQuery({
    queryKey: ['course-grades', courseId],
    queryFn: async () => {
      const response = await gradesService.getCourseGrades(courseId);
      return response.data?.grades || [];
    },
    enabled: !!courseId,
  });
}

export function useStudentGrades(courseId: string, studentId: string) {
  return useQuery({
    queryKey: ['student-grades', courseId, studentId],
    queryFn: async () => {
      const response = await gradesService.getStudentGrades(courseId, studentId);
      return response.data?.grades || [];
    },
    enabled: !!courseId && !!studentId,
  });
}
