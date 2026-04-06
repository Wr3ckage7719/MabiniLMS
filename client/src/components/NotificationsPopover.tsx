import { Bell, Clock, MessageSquare, Send, Heart } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { mockStudentSubmissions, mockStudentComments, mockStudentPosts, mockClasses } from '@/lib/data';

interface NotificationsPopoverProps {
  role?: 'student' | 'teacher';
}

export function NotificationsPopover({ role = 'student' }: NotificationsPopoverProps) {
  const [open, setOpen] = useState(false);

  // Different notifications based on role
  const getNotifications = () => {
    if (role === 'teacher') {
      // Teachers see: submissions, grading reminders, and announcements
      return [
        ...mockStudentSubmissions.map(sub => ({ ...sub, type: 'submission' as const })),
        ...mockStudentComments.map(cmt => ({ ...cmt, type: 'comment' as const })),
      ];
    } else {
      // Students only see teacher posts
      return mockStudentPosts.map(post => ({ ...post, type: 'post' as const }));
    }
  };

  const allNotifications = getNotifications();
  const notificationCount = allNotifications.length;

  const getClassColor = (classId: string) => {
    const cls = mockClasses.find(c => c.id === classId);
    return cls?.color || 'blue';
  };

  const getClassInfo = (classId: string) => {
    return mockClasses.find(c => c.id === classId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl hover:bg-primary/10"
        >
          <Bell className="h-5 w-5" />
          <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-destructive border-2 border-background">
            {notificationCount}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-screen max-w-md md:w-96 rounded-xl p-0 shadow-lg border overflow-hidden md:overflow-visible max-h-screen md:max-h-[500px]">
        <ScrollArea className="h-screen md:h-[500px] w-full">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="font-semibold text-sm">Notifications</h2>
              <Badge variant="secondary" className="text-xs">
                {notificationCount}
              </Badge>
            </div>

            {/* Teacher Notifications */}
            {role === 'teacher' && (
              <>
                {/* Student Submissions Section */}
                {mockStudentSubmissions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2">
                      <Send className="h-4 w-4 text-teal-600" />
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Submissions
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {mockStudentSubmissions.map((submission) => {
                        const cls = getClassInfo(submission.classId);
                        return (
                          <div
                            key={submission.id}
                            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent hover:border-primary/20"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar className="h-8 w-8 flex-shrink-0">
                                <AvatarFallback className="bg-teal-600 text-white text-xs font-medium">
                                  {submission.studentAvatar}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary">
                                  {cls?.name} · {submission.studentName}
                                </p>
                                <p className="text-sm text-foreground line-clamp-1">
                                  {submission.assignmentTitle}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {submission.submittedDate}
                                </p>
                              </div>
                              {submission.grade && (
                                <Badge variant="secondary" className="text-xs flex-shrink-0">
                                  {submission.grade}%
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Student Comments Section */}
                {mockStudentComments.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Comments
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {mockStudentComments.map((comment) => {
                        const cls = getClassInfo(comment.classId);
                        return (
                          <div
                            key={comment.id}
                            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent hover:border-primary/20"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar className="h-8 w-8 flex-shrink-0">
                                <AvatarFallback className="bg-blue-600 text-white text-xs font-medium">
                                  {comment.studentAvatar}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary">
                                  {cls?.name} · {comment.studentName}
                                </p>
                                <p className="text-sm text-foreground line-clamp-2">
                                  {comment.content}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  on "{comment.postTitle}"
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {comment.timestamp}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Student Notifications */}
            {role === 'student' && (
              <>
                {/* Teacher Posts Section */}
                {mockStudentPosts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2">
                      <Heart className="h-4 w-4 text-pink-600" />
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Teacher Posts
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {mockStudentPosts.map((post) => {
                        const cls = getClassInfo(post.classId);
                        return (
                          <div
                            key={post.id}
                            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer border border-transparent hover:border-primary/20"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar className="h-8 w-8 flex-shrink-0">
                                <AvatarFallback className="bg-pink-600 text-white text-xs font-medium">
                                  {post.studentAvatar}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-primary">
                                  {cls?.name} · Teacher
                                </p>
                                <p className="text-sm text-foreground line-clamp-2">
                                  {post.content}
                                </p>
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3 w-3" />
                                    {post.likes}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" />
                                    {post.comments}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {post.timestamp}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {notificationCount === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
