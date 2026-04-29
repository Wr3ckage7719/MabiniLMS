import { Heart, MessageCircle, Repeat2 } from 'lucide-react';
import { Announcement } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { useAnnouncementInteractions } from '@/hooks/useAnnouncementInteractions';

interface AnnouncementActionsProps {
  announcement: Announcement;
  commentsCount?: number;
  onOpenComments?: () => void;
}

export function AnnouncementActions({
  announcement,
  commentsCount,
  onOpenComments,
}: AnnouncementActionsProps) {
  const totalComments = typeof commentsCount === 'number' ? commentsCount : announcement.comments;
  const { liked, toggleLike, share } = useAnnouncementInteractions(announcement.id);

  return (
    <div className="flex gap-4 pt-2 border-t border-muted opacity-70 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
        onClick={toggleLike}
        aria-pressed={liked}
        title={liked ? 'Unlike' : 'Like'}
      >
        <Heart className={`h-4 w-4 mr-1.5 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
        <span className="text-xs">{liked ? 'Liked' : 'Like'}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-all"
        onClick={onOpenComments}
        disabled={!onOpenComments}
        title="View announcement comments"
      >
        <MessageCircle className="h-4 w-4 mr-1.5" />
        <span className="text-xs">{totalComments}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg text-muted-foreground hover:text-green-500 hover:bg-green-50 transition-all"
        onClick={() => {
          void share(announcement);
        }}
        title="Share announcement"
      >
        <Repeat2 className="h-4 w-4 mr-1.5" />
        <span className="text-xs">Share</span>
      </Button>
    </div>
  );
}
