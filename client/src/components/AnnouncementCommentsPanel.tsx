import { KeyboardEvent, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { Announcement } from '@/lib/data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  AnnouncementComment,
  useAnnouncementComments,
  useCreateAnnouncementComment,
} from '@/hooks-api/useAnnouncementComments';
import { useToast } from '@/hooks/use-toast';

interface DisplayComment {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

interface AnnouncementCommentsPanelProps {
  courseId: string;
  announcement: Announcement;
  onBack?: () => void;
}

const toDisplayComment = (comment: AnnouncementComment): DisplayComment => {
  const firstName = comment.author?.first_name?.trim() || '';
  const lastName = comment.author?.last_name?.trim() || '';
  const authorName = `${firstName} ${lastName}`.trim() || comment.author?.email || 'User';
  const authorAvatar =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    authorName.slice(0, 2).toUpperCase();

  return {
    id: comment.id,
    authorName,
    authorAvatar,
    authorAvatarUrl: comment.author?.avatar_url || null,
    content: comment.content,
    createdAt: comment.created_at,
  };
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function AnnouncementCommentsPanel({
  courseId,
  announcement,
  onBack,
}: AnnouncementCommentsPanelProps) {
  const { toast } = useToast();
  const { data: apiComments = [], isLoading } = useAnnouncementComments(announcement.id);
  const createCommentMutation = useCreateAnnouncementComment(announcement.id, courseId);
  const [newComment, setNewComment] = useState('');

  const comments = useMemo(() => apiComments.map(toDisplayComment), [apiComments]);

  const handleSubmitComment = async () => {
    const content = newComment.trim();
    if (!content) return;

    try {
      await createCommentMutation.mutateAsync({ content });
      setNewComment('');
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to post comment';

      toast({
        title: 'Comment failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmitComment();
    }
  };

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <header className="h-16 flex items-center gap-3 border-b border-border bg-card/95 px-4 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-foreground hover:bg-secondary"
          onClick={onBack}
          aria-label="Back to stream"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-[22px] font-semibold tracking-tight">Announcement comments</h2>
      </header>

      <div className="border-b border-border bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Announcement</p>
        {announcement.title ? (
          <p className="mt-1 text-sm font-semibold text-foreground line-clamp-1">{announcement.title}</p>
        ) : null}
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{announcement.content}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mb-2 animate-spin" />
            <p className="text-sm">Loading comments...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-3xl md:text-4xl font-medium text-muted-foreground">No comments</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {comment.authorAvatarUrl ? (
                      <AvatarImage src={comment.authorAvatarUrl} alt={`${comment.authorName} avatar`} />
                    ) : null}
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                      {comment.authorAvatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{comment.authorName}</p>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(comment.createdAt)}
                      </p>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card/95 px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-input bg-background px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/30">
          <input
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Add announcement comment"
            className="h-9 w-full bg-transparent text-[18px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button
            variant="default"
            size="icon"
            onClick={() => {
              void handleSubmitComment();
            }}
            disabled={!newComment.trim() || createCommentMutation.isPending}
            className="h-8 w-8 rounded-full shadow-sm disabled:opacity-40"
            aria-label="Send announcement comment"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
