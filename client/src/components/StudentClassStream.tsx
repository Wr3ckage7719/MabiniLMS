import { useMemo, useState } from 'react';
import { Heart, Loader2, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useRole } from '@/contexts/RoleContext';
import { useToast } from '@/hooks/use-toast';
import {
  DiscussionPost,
  useCreateDiscussionPost,
  useDiscussionPosts,
  useToggleDiscussionPostLike,
} from '@/hooks-api/useDiscussions';

interface StudentPost {
  id: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
}

interface StudentClassStreamProps {
  classId: string;
}

const toDisplayPost = (post: DiscussionPost): StudentPost => {
  const firstName = post.author?.first_name?.trim() || '';
  const lastName = post.author?.last_name?.trim() || '';
  const studentName =
    `${firstName} ${lastName}`.trim() || post.author?.email || 'Student';
  const studentAvatar =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    studentName.slice(0, 2).toUpperCase();

  return {
    id: post.id,
    studentName,
    studentAvatar,
    content: post.content,
    timestamp: post.created_at,
    likes: post.likes_count,
    liked: post.liked_by_me,
  };
};

export function StudentClassStream({ classId }: StudentClassStreamProps) {
  const { currentUserAvatar } = useRole();
  const { toast } = useToast();
  const { data: apiPosts = [], isLoading: postsLoading } = useDiscussionPosts(classId);
  const createPostMutation = useCreateDiscussionPost(classId);
  const toggleLikeMutation = useToggleDiscussionPostLike(classId);

  const [postContent, setPostContent] = useState('');
  const [likingPostId, setLikingPostId] = useState<string | null>(null);

  const posts = useMemo(() => {
    return apiPosts.map(toDisplayPost);
  }, [apiPosts]);

  const handlePost = async () => {
    if (!postContent.trim()) return;

    try {
      await createPostMutation.mutateAsync({ content: postContent.trim() });
      setPostContent('');
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to publish your post';

      toast({
        title: 'Post failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const toggleLike = async (postId: string) => {
    setLikingPostId(postId);
    try {
      await toggleLikeMutation.mutateAsync(postId);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update reaction';

      toast({
        title: 'Like failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLikingPostId(null);
    }
  };

  const formatTime = (date: Date) => {
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

  return (
    <div className="flex flex-col h-full space-y-4 md:space-y-6">
      <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Discussion posts sync to your class stream across devices.
      </div>

      {/* Posts Feed */}
      <div className="space-y-3 md:space-y-4 flex-1 overflow-y-auto">
        {postsLoading ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
            <p className="text-sm md:text-base">Loading class discussion...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <p className="text-sm md:text-base">No data present: class discussion posts</p>
          </div>
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 md:p-6">
                {/* Header */}
                <div className="flex gap-3 mb-3">
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">{post.studentAvatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="font-medium text-sm">{post.studentName}</p>
                      <p className="text-xs text-muted-foreground">{formatTime(new Date(post.timestamp))}</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground mb-3 leading-relaxed">{post.content}</p>

                {/* Actions */}
                <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <button
                    onClick={() => {
                      void toggleLike(post.id);
                    }}
                    disabled={toggleLikeMutation.isPending && likingPostId === post.id}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group mt-2"
                  >
                    <Heart
                      className={`h-4 w-4 transition-all ${post.liked ? 'fill-destructive text-destructive' : 'group-hover:scale-110'}`}
                    />
                    <span>{post.likes}</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Post Input - Sticky Bottom */}
      <Card className="border-0 shadow-sm flex-shrink-0">
        <CardContent className="p-4 md:p-6">
          <div className="flex gap-3">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">{currentUserAvatar}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="space-y-3">
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Share your thoughts, ask questions, or discuss with classmates..."
                  className="w-full min-h-[80px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      toast({
                        title: 'Attachments unavailable',
                        description: 'File attachments are not supported in discussion posts yet.',
                      });
                    }}
                    className="gap-2 text-muted-foreground hover:text-foreground rounded-lg h-8"
                  >
                    <Paperclip className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Attach</span>
                  </Button>
                  <Button
                    onClick={handlePost}
                    disabled={!postContent.trim() || createPostMutation.isPending}
                    className="gap-2 rounded-lg h-8"
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-xs">
                      {createPostMutation.isPending ? 'Posting...' : 'Post'}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
