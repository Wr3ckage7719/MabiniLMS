import { useState } from 'react';
import { Announcement } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface AnnouncementCardProps {
  announcement: Announcement;
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const [showCommentsNotice, setShowCommentsNotice] = useState(false);

  return (
    <Card className="border-0 shadow-sm card-interactive">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-accent text-accent-foreground text-sm">{announcement.avatar}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{announcement.author}</span>
              <span className="text-xs text-muted-foreground">{announcement.timestamp}</span>
            </div>
            {announcement.title && (
              <p className="mt-2 text-sm font-semibold">{announcement.title}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed">{announcement.content}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2 text-muted-foreground rounded-lg"
              onClick={() => setShowCommentsNotice(!showCommentsNotice)}
            >
              <MessageSquare className="h-4 w-4 mr-1" /> {announcement.comments} comments
            </Button>

            {showCommentsNotice && (
              <div className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Announcement comments are currently unavailable in this class stream.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
