import { UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  DiscussionPost,
  DiscussionPostData,
  discussionsService,
} from '@/services/discussions.service';

export type { DiscussionPost, DiscussionPostData } from '@/services/discussions.service';

export function useDiscussionPosts(
  courseId?: string
): UseQueryResult<DiscussionPost[], Error> {
  const { isLoggedIn, isLoading: authLoading } = useAuth();

  return useQuery({
    queryKey: ['discussion-posts', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const response = await discussionsService.getDiscussionPosts(courseId);
      return response?.data || [];
    },
    enabled: !authLoading && isLoggedIn && !!courseId,
    staleTime: 30 * 1000,
    refetchOnReconnect: true,
    refetchInterval: 10 * 1000,
  });
}

export function useCreateDiscussionPost(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DiscussionPostData) =>
      discussionsService.createDiscussionPost(courseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussion-posts', courseId] });
    },
  });
}

export function useToggleDiscussionPostLike(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) =>
      discussionsService.toggleDiscussionPostLike(courseId, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussion-posts', courseId] });
    },
  });
}

export function useHideDiscussionPost(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) =>
      discussionsService.hideDiscussionPost(courseId, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussion-posts', courseId] });
    },
  });
}

export function useDeleteDiscussionPost(courseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) =>
      discussionsService.deleteDiscussionPost(courseId, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussion-posts', courseId] });
    },
  });
}
