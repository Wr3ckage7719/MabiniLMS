import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { transformMaterials } from '@/services/data-transformer';
import { LearningMaterial } from '@/lib/data';
import { materialsService, MaterialEngagementRecord } from '@/services/materials.service';
import { precacheMaterialUrls } from '@/services/material-cache.service';

export function useMaterials(courseId?: string): UseQueryResult<LearningMaterial[], Error> {
  return useQuery({
    queryKey: ['materials', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const response = await apiClient.get(`/courses/${courseId}/materials`);
      const materials = transformMaterials(response.data || []);
      // Warm the offline material cache for everything the student can see.
      // The SW skips files larger than the configured threshold so this is
      // safe even with a long materials list.
      precacheMaterialUrls(materials.map((material) => material.url ?? null));
      return materials;
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
