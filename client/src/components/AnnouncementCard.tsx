import { useEffect, useState } from 'react';
import { Announcement } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageSquare, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AnnouncementCardProps {
  announcement: Announcement;
  commentsCount?: number;
  onOpenComments?: () => void;
}

const ANNOUNCEMENT_LIKES_STORAGE_KEY = 'mabini:announcement-likes';

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
};

export function AnnouncementCard({ announcement, commentsCount, onOpenComments }: AnnouncementCardProps) {
  const { toast } = useToast();
  const totalComments = typeof commentsCount === 'number' ? commentsCount : announcement.comments;
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const likesByAnnouncement = readStoredAnnouncementLikes();
    setLiked(likesByAnnouncement[announcement.id] === true);
  }, [announcement.id]);

  const handleToggleLike = () => {
    setLiked((currentValue) => {
      const nextValue = !currentValue;
      const likesByAnnouncement = readStoredAnnouncementLikes();
      likesByAnnouncement[announcement.id] = nextValue;
      writeStoredAnnouncementLikes(likesByAnnouncement);
      return nextValue;
    });
  };

  const handleShare = async () => {
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
    } catch {
      toast({
        title: 'Share failed',
        description: 'Unable to share this announcement right now.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card
      id={`announcement-${announcement.id}`}
      className="rounded-2xl border border-border/70 shadow-none md:shadow-sm transition-shadow hover:shadow-md"
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 md:h-10 md:w-10">
            {announcement.avatarUrl ? (
              <AvatarImage src={announcement.avatarUrl} alt={`${announcement.author} avatar`} />
            ) : null}
            <AvatarFallback className="bg-accent text-accent-foreground text-sm font-semibold">
              {announcement.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[13px] md:text-sm">{announcement.author}</span>
              <span className="text-xs text-muted-foreground">{announcement.timestamp}</span>
            </div>
            <p className="mt-1.5 text-[13px] md:text-sm font-semibold">
              {announcement.title?.trim() || 'Announcement'}
            </p>
            <p className="mt-2 text-[13px] md:text-sm leading-relaxed break-words">{announcement.content}</p>

            <div className="mt-3 border-t border-border/80 pt-2">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md px-2 text-xs hover:text-foreground"
                  onClick={handleToggleLike}
                >
                  <Heart className={`mr-1.5 h-4 w-4 ${liked ? 'fill-destructive text-destructive' : ''}`} />
                  Like
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md px-2 text-xs hover:text-foreground"
                  onClick={onOpenComments}
                  disabled={!onOpenComments}
                >
                  <MessageSquare className="mr-1.5 h-4 w-4" />
                  {totalComments}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-md px-2 text-xs hover:text-foreground"
                  onClick={() => {
                    void handleShare();
                  }}
                >
                  <Share2 className="mr-1.5 h-4 w-4" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
