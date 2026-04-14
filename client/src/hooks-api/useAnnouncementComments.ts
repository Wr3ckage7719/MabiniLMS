import { UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  AnnouncementComment,
  AnnouncementCommentData,
  announcementsService,
} from '@/services/announcements.service';

export type { AnnouncementComment, AnnouncementCommentData } from '@/services/announcements.service';

export function useAnnouncementComments(
  announcementId?: string
): UseQueryResult<AnnouncementComment[], Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['announcement-comments', announcementId],
    queryFn: async () => {
      if (!announcementId) return [];
      const response = await announcementsService.getAnnouncementComments(announcementId);
      return response?.data || [];
    },
    enabled: !authLoading && isLoggedIn && !!announcementId,
    staleTime: 30 * 1000,
    refetchOnReconnect: true,
  });
}

export function useCreateAnnouncementComment(announcementId: string, courseId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AnnouncementCommentData) =>
      announcementsService.createAnnouncementComment(announcementId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement-comments', announcementId] });
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: ['announcements', courseId] });
      }
    },
  });
}
