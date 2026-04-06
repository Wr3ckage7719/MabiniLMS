import { useState } from 'react';
import { Heart, Paperclip, Send, X, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useRole } from '@/contexts/RoleContext';
import { mockStudents } from '@/lib/data';

interface StudentPost {
  id: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  attachments: AttachmentFile[];
  timestamp: Date;
  likes: number;
  liked: boolean;
  replies?: number;
}

interface AttachmentFile {
  id: string;
  name: string;
  size: string;
  type: string;
  icon: React.ReactNode;
}

const FILE_ICONS: Record<string, string> = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  image: '🖼️',
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  video: '🎬',
  mp4: '🎬',
  ppt: '📊',
  pptx: '📊',
  xls: '📈',
  xlsx: '📈',
  zip: '📦',
  rar: '📦',
  default: '📎',
};

const getFileType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || FILE_ICONS['default'];
};

export function StudentClassStream() {
  const { currentUserAvatar } = useRole();
  const currentStudent = mockStudents[0];
  const [posts, setPosts] = useState<StudentPost[]>([
    {
      id: '1',
      studentId: '2',
      studentName: 'Sarah Chen',
      studentAvatar: 'SC',
      content: "Just finished the chapter reading. Really interesting perspective on the Industrial Revolution!",
      attachments: [],
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      likes: 3,
      liked: false,
      replies: 2,
    },
    {
      id: '2',
      studentId: '3',
      studentName: 'Alex Rodriguez',
      studentAvatar: 'AR',
      content: 'I have a question about the homework problem set. Is the due date really tomorrow?',
      attachments: [
        { id: 'a1', name: 'homework_questions.pdf', size: '2.4 MB', type: 'pdf', icon: getFileType('homework_questions.pdf') },
      ],
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      likes: 1,
      liked: false,
    },
  ]);

  const [postContent, setPostContent] = useState('');
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const handleAddAttachment = () => {
    // In a real app, this would open a file picker
    const mockFile: AttachmentFile = {
      id: Math.random().toString(),
      name: 'sample_document.pdf',
      size: '1.2 MB',
      type: 'pdf',
      icon: getFileType('sample_document.pdf'),
    };
    setAttachments([...attachments, mockFile]);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const handlePost = () => {
    if (!postContent.trim()) return;

    const newPost: StudentPost = {
      id: Math.random().toString(),
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      studentAvatar: currentStudent.avatar,
      content: postContent,
      attachments,
      timestamp: new Date(),
      likes: 0,
      liked: false,
    };

    setPosts([newPost, ...posts]);
    setPostContent('');
    setAttachments([]);
  };

  const toggleLike = (postId: string) => {
    setPosts(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? post.likes - 1 : post.likes + 1,
            }
          : post
      )
    );
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
      {/* Posts Feed */}
      <div className="space-y-3 md:space-y-4 flex-1 overflow-y-auto">
        {posts.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <p className="text-sm md:text-base">No posts yet. Be the first to share!</p>
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
                      <p className="text-xs text-muted-foreground">{formatTime(post.timestamp)}</p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground mb-3 leading-relaxed">{post.content}</p>

                {/* Attachments */}
                {post.attachments.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Attachments:</p>
                    <div className="space-y-2">
                      {post.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/40 hover:bg-secondary/60 transition-colors group cursor-pointer"
                        >
                          <span className="text-base flex-shrink-0">{attachment.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{attachment.name}</p>
                            <p className="text-xs text-muted-foreground">{attachment.size}</p>
                          </div>
                          <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group mt-2"
                  >
                    <Heart
                      className={`h-4 w-4 transition-all ${post.liked ? 'fill-destructive text-destructive' : 'group-hover:scale-110'}`}
                    />
                    <span>{post.likes}</span>
                  </button>
                  {post.replies !== undefined && (
                    <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
                      <span>💬</span>
                      <span>{post.replies} replies</span>
                    </button>
                  )}
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
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">{currentStudent.avatar}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="space-y-3">
                <textarea
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  placeholder="Share your thoughts, ask questions, or discuss with classmates..."
                  className="w-full min-h-[80px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Attachments ({attachments.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((attachment) => (
                        <Badge
                          key={attachment.id}
                          variant="secondary"
                          className="px-2 py-1.5 flex items-center gap-1.5 bg-secondary/60 hover:bg-secondary/80 group"
                        >
                          <span>{attachment.icon}</span>
                          <span className="text-xs truncate max-w-[120px]">{attachment.name}</span>
                          <button
                            onClick={() => handleRemoveAttachment(attachment.id)}
                            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddAttachment}
                    className="gap-2 text-muted-foreground hover:text-foreground rounded-lg h-8"
                  >
                    <Paperclip className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Attach</span>
                  </Button>
                  <Button
                    onClick={handlePost}
                    disabled={!postContent.trim()}
                    className="gap-2 rounded-lg h-8"
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline text-xs">Post</span>
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
