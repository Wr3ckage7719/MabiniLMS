import { useState } from 'react';
import { Announcement } from '@/lib/data';
import { useRole } from '@/contexts/RoleContext';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Send } from 'lucide-react';

interface Comment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
}

interface AnnouncementCardProps {
  announcement: Announcement;
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const { currentUserName, currentUserAvatar } = useRole();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([
    { id: '1', author: 'Bob Smith', avatar: 'BS', content: 'Thanks for the update!', timestamp: '1 hour ago' },
  ]);

  const handleComment = () => {
    if (!newComment.trim()) return;
    setComments(prev => [...prev, {
      id: String(prev.length + 1),
      author: currentUserName,
      avatar: currentUserAvatar,
      content: newComment,
      timestamp: 'Just now',
    }]);
    setNewComment('');
  };

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
            <p className="mt-2 text-sm leading-relaxed">{announcement.content}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2 text-muted-foreground rounded-lg"
              onClick={() => setShowComments(!showComments)}
            >
              <MessageSquare className="h-4 w-4 mr-1" /> {comments.length} comments
            </Button>

            {showComments && (
              <div className="mt-3 space-y-3 animate-fade-in">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 pl-1">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-[10px]">{c.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-secondary/30 rounded-xl p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{c.author}</span>
                        <span className="text-[10px] text-muted-foreground">{c.timestamp}</span>
                      </div>
                      <p className="text-sm mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pl-1">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[50px] flex-1 text-sm"
                  />
                  <Button size="icon" variant="ghost" className="rounded-xl self-end" disabled={!newComment.trim()} onClick={handleComment}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
