import { useToast } from '@/hooks/use-toast';
import { Bell, Plus, Send, MoreVertical, Heart } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AnnouncementActions } from '@/components/AnnouncementActions';
import { Announcement as ClassAnnouncement } from '@/lib/data';

export interface TeacherDiscussionPost {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorAvatarUrl?: string | null;
  content: string;
  timestamp: string;
  likes: number;
  liked: boolean;
  isHidden: boolean;
}

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

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

interface StreamTabProps {
  announcements: ClassAnnouncement[];
  announcementsLoading: boolean;
  announcementText: string;
  setAnnouncementText: (v: string) => void;
  postingAnnouncement: boolean;
  handlePostAnnouncement: () => void;
  deletingAnnouncementIds: string[];
  handleDeleteAnnouncement: (id: string) => void;
  openEditAnnouncementDialog: (a: { id: string; title?: string; content: string; pinned?: boolean }) => void;
  handleTogglePinAnnouncement: (id: string, pinned: boolean | undefined, title: string | undefined, content: string) => void;
  setSelectedAnnouncementForComments: (a: ClassAnnouncement | null) => void;
  discussionPosts: TeacherDiscussionPost[];
  discussionPostsLoading: boolean;
  likingDiscussionPostIds: string[];
  handleToggleDiscussionPostLike: (id: string) => void;
  hidingDiscussionPostIds: string[];
  handleHideDiscussionPost: (id: string) => void;
  deletingDiscussionPostIds: string[];
  handleDeleteDiscussionPost: (id: string) => void;
}

export function StreamTab({
  announcements,
  announcementsLoading,
  announcementText,
  setAnnouncementText,
  postingAnnouncement,
  handlePostAnnouncement,
  deletingAnnouncementIds,
  handleDeleteAnnouncement,
  openEditAnnouncementDialog,
  handleTogglePinAnnouncement,
  setSelectedAnnouncementForComments,
  discussionPosts,
  discussionPostsLoading,
  likingDiscussionPostIds,
  handleToggleDiscussionPostLike,
  hidingDiscussionPostIds,
  handleHideDiscussionPost,
  deletingDiscussionPostIds,
  handleDeleteDiscussionPost,
}: StreamTabProps) {
  const { toast } = useToast();

  return (
    <>
      {/* Announcement Composer */}
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Post an Announcement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Share important updates, reminders, or information with your class..."
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            className="min-h-20 resize-none rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => {
                  toast({
                    title: 'Attachments not available',
                    description: 'Announcement file attachments are not supported yet.',
                  });
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={handlePostAnnouncement}
              disabled={!announcementText.trim() || postingAnnouncement}
              className="rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300"
            >
              <Send className="h-4 w-4 mr-2" />
              {postingAnnouncement ? 'Posting...' : 'Post'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Announcements List */}
      <div className="space-y-4">
        {announcementsLoading ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center text-muted-foreground">
              Loading announcements...
            </CardContent>
          </Card>
        ) : announcements.length > 0 ? (
          <div className="space-y-3">
            {announcements.map((announcement, idx) => (
              <Card
                key={announcement.id}
                className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                style={{
                  animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                }}
              >
                <CardContent className="p-4 md:p-5">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-blue-100/50 group-hover:ring-blue-200 transition-all">
                          {announcement.avatarUrl ? (
                            <AvatarImage
                              src={announcement.avatarUrl}
                              alt={`${announcement.author} avatar`}
                            />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white font-semibold text-sm">
                            {announcement.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm group-hover:text-primary transition-colors">{announcement.author}</p>
                          <p className="text-xs text-muted-foreground">
                            {announcement.timestamp}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-lg">
                          <DropdownMenuItem
                            onClick={() => openEditAnnouncementDialog(announcement)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleTogglePinAnnouncement(
                                announcement.id,
                                announcement.pinned,
                                announcement.title,
                                announcement.content
                              )
                            }
                          >
                            {announcement.pinned ? 'Unpin' : 'Pin to Top'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            disabled={deletingAnnouncementIds.includes(announcement.id)}
                            onClick={() => handleDeleteAnnouncement(announcement.id)}
                          >
                            {deletingAnnouncementIds.includes(announcement.id) ? 'Deleting...' : 'Delete'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Content */}
                    {announcement.title &&
                      announcement.title.trim().toLowerCase() !== announcement.content.trim().toLowerCase() &&
                      announcement.title.trim().toLowerCase() !== 'announcement' && (
                      <p className="text-sm font-semibold text-foreground">{announcement.title}</p>
                    )}
                    <p className="text-sm leading-relaxed text-foreground/90">{announcement.content}</p>
                    {announcement.pinned && (
                      <Badge className="w-fit bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        Pinned
                      </Badge>
                    )}

                    {/* Actions */}
                    <AnnouncementActions
                      announcement={announcement}
                      onOpenComments={() => setSelectedAnnouncementForComments(announcement)}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-blue-100 p-4">
                  <Bell className="h-8 w-8 text-blue-500" />
                </div>
              </div>
              <p className="text-muted-foreground font-medium">
                No announcements yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Post one to get started!
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Class Discussion Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Class Discussion
          </h3>
          <span className="text-xs text-muted-foreground">
            {discussionPosts.length} {discussionPosts.length === 1 ? 'post' : 'posts'}
          </span>
        </div>

        {discussionPostsLoading ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center text-muted-foreground">
              Loading class discussion...
            </CardContent>
          </Card>
        ) : discussionPosts.length > 0 ? (
          <div className="space-y-3">
            {discussionPosts.map((post, idx) => (
              <Card
                key={post.id}
                className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                style={{
                  animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 40}ms both`,
                }}
              >
                <CardContent className="p-4 md:p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          {post.authorAvatarUrl ? (
                            <AvatarImage
                              src={post.authorAvatarUrl}
                              alt={`${post.authorName} avatar`}
                            />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-slate-400 to-slate-600 text-white font-semibold text-sm">
                            {post.authorAvatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{post.authorName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(post.timestamp)}
                          </p>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-lg">
                          <DropdownMenuItem
                            disabled={
                              post.isHidden || hidingDiscussionPostIds.includes(post.id)
                            }
                            onClick={() => handleHideDiscussionPost(post.id)}
                          >
                            {hidingDiscussionPostIds.includes(post.id)
                              ? 'Hiding...'
                              : post.isHidden
                              ? 'Already hidden'
                              : 'Hide comment'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            disabled={deletingDiscussionPostIds.includes(post.id)}
                            onClick={() => handleDeleteDiscussionPost(post.id)}
                          >
                            {deletingDiscussionPostIds.includes(post.id)
                              ? 'Removing...'
                              : 'Remove comment'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {post.isHidden ? (
                      <div className="rounded-lg border border-dashed border-muted px-3 py-2">
                        <p className="text-sm text-muted-foreground italic">
                          This post was hidden by the teacher.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-foreground/90">{post.content}</p>
                    )}

                    <div className="flex gap-4 pt-2 border-t border-muted opacity-80 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                        disabled={
                          post.isHidden || likingDiscussionPostIds.includes(post.id)
                        }
                        onClick={() => handleToggleDiscussionPostLike(post.id)}
                      >
                        <Heart
                          className={`h-4 w-4 mr-1.5 ${
                            post.liked ? 'fill-destructive text-destructive' : ''
                          }`}
                        />
                        <span className="text-xs">{post.likes}</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-slate-100 p-4">
                  <Bell className="h-8 w-8 text-slate-500" />
                </div>
              </div>
              <p className="text-muted-foreground font-medium">
                No student discussion posts yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                New student posts will appear here automatically.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
