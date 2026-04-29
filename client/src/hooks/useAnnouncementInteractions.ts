import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const ANNOUNCEMENT_LIKES_STORAGE_KEY = 'mabini:announcement-likes';
const ANNOUNCEMENT_LIKES_EVENT = 'mabini:announcement-likes-updated';

const readStoredAnnouncementLikes = (): Record<string, boolean> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = localStorage.getItem(ANNOUNCEMENT_LIKES_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, boolean>>((accumulator, [key, value]) => {
      accumulator[key] = value === true;
      return accumulator;
    }, {});
  } catch {
    return {};
  }
};

const writeStoredAnnouncementLikes = (likesByAnnouncement: Record<string, boolean>): void => {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(ANNOUNCEMENT_LIKES_STORAGE_KEY, JSON.stringify(likesByAnnouncement));
  window.dispatchEvent(new CustomEvent(ANNOUNCEMENT_LIKES_EVENT));
};

interface ShareTarget {
  id: string;
  classId: string;
  title?: string;
  content: string;
}

interface UseAnnouncementInteractionsResult {
  liked: boolean;
  toggleLike: () => void;
  share: (announcement: ShareTarget) => Promise<void>;
}

export function useAnnouncementInteractions(announcementId: string): UseAnnouncementInteractionsResult {
  const { toast } = useToast();
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const sync = () => {
      const likesByAnnouncement = readStoredAnnouncementLikes();
      setLiked(likesByAnnouncement[announcementId] === true);
    };

    sync();

    if (typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key === ANNOUNCEMENT_LIKES_STORAGE_KEY) sync();
    };
    const onCustom = () => sync();

    window.addEventListener('storage', onStorage);
    window.addEventListener(ANNOUNCEMENT_LIKES_EVENT, onCustom);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(ANNOUNCEMENT_LIKES_EVENT, onCustom);
    };
  }, [announcementId]);

  const toggleLike = useCallback(() => {
    setLiked((currentValue) => {
      const nextValue = !currentValue;
      const likesByAnnouncement = readStoredAnnouncementLikes();
      likesByAnnouncement[announcementId] = nextValue;
      writeStoredAnnouncementLikes(likesByAnnouncement);
      return nextValue;
    });
  }, [announcementId]);

  const share = useCallback(
    async (announcement: ShareTarget) => {
      const title = announcement.title?.trim() || 'Announcement';
      const shareText = `${title}\n\n${announcement.content}`.trim();
      const shareUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/class/${announcement.classId}#announcement-${announcement.id}`
          : '';

      try {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          await navigator.share({
            title,
            text: shareText,
            url: shareUrl || undefined,
          });
          return;
        }

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl || shareText);
          toast({
            title: 'Link copied',
            description: 'Announcement link copied to clipboard.',
          });
          return;
        }

        toast({
          title: 'Share unavailable',
          description: 'Your browser does not support sharing for this content.',
        });
      } catch (error) {
        // User cancelled the native share sheet — not an error worth surfacing.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        toast({
          title: 'Share failed',
          description: 'Unable to share this announcement right now.',
          variant: 'destructive',
        });
      }
    },
    [toast]
  );

  return { liked, toggleLike, share };
}
