import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  assessmentGatingService,
  type AssessmentLockState,
  type RequiredMaterialsResponse,
  type SetRequiredMaterialsPayload,
} from '@/services/assessment-gating.service';
import { useAuth } from '@/contexts/AuthContext';

export function useAssessmentLockState(
  assignmentId: string | null | undefined
): UseQueryResult<AssessmentLockState | null, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['assessment-lock-state', assignmentId],
    queryFn: async () => {
      if (!assignmentId) return null;
      return assessmentGatingService.getMyLockState(assignmentId);
    },
    enabled: !authLoading && isLoggedIn && Boolean(assignmentId),
    staleTime: 30 * 1000,
    refetchOnReconnect: true,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });
}

export function useRequiredMaterials(
  assignmentId: string | null | undefined
): UseQueryResult<RequiredMaterialsResponse | null, Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['assessment-required-materials', assignmentId],
    queryFn: async () => {
      if (!assignmentId) return null;
      return assessmentGatingService.getRequiredMaterials(assignmentId);
    },
    enabled: !authLoading && isLoggedIn && Boolean(assignmentId),
    staleTime: 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });
}

export function useSetRequiredMaterials(assignmentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SetRequiredMaterialsPayload) => {
      return assessmentGatingService.setRequiredMaterials(assignmentId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-required-materials', assignmentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-lock-state', assignmentId],
      });
    },
  });
}
