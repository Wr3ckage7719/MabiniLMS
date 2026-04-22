import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { transformMaterials } from '@/services/data-transformer';
import { LearningMaterial } from '@/lib/data';
import { materialsService, MaterialEngagementRecord } from '@/services/materials.service';

export function useMaterials(courseId?: string): UseQueryResult<LearningMaterial[], Error> {
  return useQuery({
    queryKey: ['materials', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const response = await apiClient.get(`/courses/${courseId}/materials`);
      return transformMaterials(response.data || []);
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useEngagementStats(
  materialId?: string,
  enabled: boolean = false
): UseQueryResult<MaterialEngagementRecord[], Error> {
  return useQuery({
    queryKey: ['material-engagement', materialId],
    queryFn: async () => {
      if (!materialId) {
        return [];
      }

      const response = await materialsService.getEngagement(materialId);
      return response.data || [];
    },
    enabled: enabled && Boolean(materialId),
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 5_000,
  });
}
