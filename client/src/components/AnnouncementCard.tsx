import { Announcement } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface AnnouncementCardProps {
  announcement: Announcement;
  commentsCount?: number;
  onOpenComments?: () => void;
}

export function AnnouncementCard({ announcement, commentsCount, onOpenComments }: AnnouncementCardProps) {
  const totalComments = typeof commentsCount === 'number' ? commentsCount : announcement.comments;

  return (
    <Card className="rounded-xl border border-border/70 shadow-none md:border-0 md:shadow-sm card-interactive">
      <CardContent className="p-3 md:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 md:h-10 md:w-10">
            <AvatarFallback className="bg-accent text-accent-foreground text-sm">{announcement.avatar}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] md:text-sm">{announcement.author}</span>
              <span className="text-xs text-muted-foreground">{announcement.timestamp}</span>
            </div>
            {announcement.title && (
              <p className="mt-1.5 text-[13px] md:text-sm font-semibold">{announcement.title}</p>
            )}
            <p className="mt-1.5 text-[13px] md:text-sm leading-relaxed">{announcement.content}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-8 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 px-3 text-xs"
              onClick={onOpenComments}
              disabled={!onOpenComments}
            >
              <MessageSquare className="h-4 w-4 mr-1" /> {totalComments}{' '}
              {totalComments === 1 ? 'comment' : 'comments'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
