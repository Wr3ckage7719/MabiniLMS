import { Announcement } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Heart, MessageSquare, Share2 } from 'lucide-react';
import { useAnnouncementInteractions } from '@/hooks/useAnnouncementInteractions';

interface AnnouncementCardProps {
  announcement: Announcement;
  commentsCount?: number;
  onOpenComments?: () => void;
}

export function AnnouncementCard({ announcement, commentsCount, onOpenComments }: AnnouncementCardProps) {
  const totalComments = typeof commentsCount === 'number' ? commentsCount : announcement.comments;
  const { liked, toggleLike, share } = useAnnouncementInteractions(announcement.id);

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
                  onClick={toggleLike}
                  aria-pressed={liked}
                >
                  <Heart className={`mr-1.5 h-4 w-4 ${liked ? 'fill-destructive text-destructive' : ''}`} />
                  {liked ? 'Liked' : 'Like'}
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
                    void share(announcement);
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
