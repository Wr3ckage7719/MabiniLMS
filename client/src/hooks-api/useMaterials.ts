import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { transformMaterials } from '@/services/data-transformer';
import { LearningMaterial } from '@/lib/data';

export function useMaterials(courseId?: string): UseQueryResult<LearningMaterial[], Error> {
  return useQuery({
    queryKey: ['materials', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const response = await apiClient.get(`/courses/${courseId}/materials`);
      return transformMaterials(response.data || []);
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
