import { useQuery, useMutation, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { assignmentsService } from '@/services/assignments.service';
import { apiClient } from '@/services/api-client';
import { transformAssignments } from '@/services/data-transformer';
import { Assignment } from '@/lib/data';
import { useAuth } from '@/contexts/AuthContext';

export function useAssignments(courseId?: string): UseQueryResult<Assignment[], Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['assignments', courseId],
    queryFn: async () => {
      if (!courseId) {
        const coursesResponse = await apiClient.get('/courses');
        const courses = coursesResponse.data?.courses || [];
        const allAssignments = await Promise.all(
          courses.map(async (course: { id: string }) => {
            try {
              const response = await assignmentsService.getAssignments(course.id);
              return transformAssignments(response.data?.assignments || []);
            } catch {
              return [];
            }
          })
        );
        return allAssignments.flat();
      }
      const response = await assignmentsService.getAssignments(courseId);
      return transformAssignments(response.data?.assignments || []);
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
    staleTime: 3 * 60 * 1000,
  });
}

export function useAssignment(courseId: string, assignmentId: string) {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['assignment', courseId, assignmentId],
    queryFn: async () => {
      const response = await assignmentsService.getAssignmentById(courseId, assignmentId);
      return transformAssignments([response.data?.assignment])[0];
    },
    enabled: !authLoading && isLoggedIn && !!courseId && !!assignmentId,
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

export function useSubmitAssignment(courseId: string, assignmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => assignmentsService.submitAssignment(courseId, assignmentId, data),
    onSuccess: (result) => {
      if (result?.queued) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['assignments', courseId] });
      queryClient.invalidateQueries({ queryKey: ['assignment', courseId, assignmentId] });
    },
  });
}
