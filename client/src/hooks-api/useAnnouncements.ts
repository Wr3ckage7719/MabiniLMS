import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { Announcement } from '@/lib/data';
import { announcementsService, Announcement as ApiAnnouncement } from '@/services/announcements.service';

const toRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Recently';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const toDisplayAnnouncement = (announcement: ApiAnnouncement): Announcement => {
  const firstName = announcement.author?.first_name?.trim() || '';
  const lastName = announcement.author?.last_name?.trim() || '';
  const author = `${firstName} ${lastName}`.trim() || announcement.author?.email || 'Instructor';
  const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || author.slice(0, 2).toUpperCase();
  const avatarUrl = announcement.author?.avatar_url || null;

  return {
    id: announcement.id,
    classId: announcement.course_id,
    author,
    avatar,
    avatarUrl,
    title: announcement.title,
    content: announcement.content,
    timestamp: toRelativeTime(announcement.created_at),
    comments: announcement.comments_count || 0,
    pinned: announcement.pinned,
  };
};

export function useAnnouncements(courseId?: string): UseQueryResult<Announcement[], Error> {
  return useQuery({
    queryKey: ['announcements', courseId],
    queryFn: async () => {
      if (!courseId) return [];
      const response = await announcementsService.getAnnouncements(courseId);
      const apiAnnouncements = response.data || [];
      return apiAnnouncements.map(toDisplayAnnouncement);
    },
    staleTime: 60 * 1000,
  });
}
