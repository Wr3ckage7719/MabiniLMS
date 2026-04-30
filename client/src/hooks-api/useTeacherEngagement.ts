import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  teacherEngagementService,
  type AssessmentReadinessSummary,
  type CourseMaterialEngagementSummary,
} from '@/services/teacher-engagement.service';
import { useAuth } from '@/contexts/AuthContext';

export function useCourseMaterialEngagement(
  courseId: string | null | undefined
): UseQueryResult<CourseMaterialEngagementSummary | null, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['course-material-engagement', courseId],
    queryFn: async () => {
      if (!courseId) return null;
      return teacherEngagementService.getCourseMaterialEngagement(courseId);
    },
    enabled: !authLoading && isLoggedIn && Boolean(courseId),
    staleTime: 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });
}

export function useAssessmentReadiness(
  assignmentId: string | null | undefined
): UseQueryResult<AssessmentReadinessSummary | null, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['assessment-readiness', assignmentId],
    queryFn: async () => {
      if (!assignmentId) return null;
      return teacherEngagementService.getAssessmentReadiness(assignmentId);
    },
    enabled: !authLoading && isLoggedIn && Boolean(assignmentId),
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });
}
