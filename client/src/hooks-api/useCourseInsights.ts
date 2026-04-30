import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { coursesService, type CourseInsightsPayload } from '@/services/courses.service';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Per-course teacher analytics. Returns the full aggregated payload in one
 * round-trip so the Insights tab does not have to fan out per-student or
 * per-material requests. Cached for two minutes — long enough to keep tab
 * switching snappy, short enough that a freshly-graded submission shows up.
 */
export function useCourseInsights(
  courseId: string | null | undefined
): UseQueryResult<CourseInsightsPayload, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['course-insights', courseId],
    queryFn: async () => {
      const response = await coursesService.getCourseInsights(courseId as string);
      return (response?.data as CourseInsightsPayload | undefined) ?? null;
    },
    enabled: !authLoading && isLoggedIn && Boolean(courseId),
    staleTime: 2 * 60 * 1000,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
  }) as UseQueryResult<CourseInsightsPayload, Error>;
}
