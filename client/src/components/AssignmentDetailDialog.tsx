import { useCallback, useEffect, useMemo, useState } from 'react';
import { Assignment } from '@/lib/data';
import { useRole } from '@/contexts/RoleContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FileText, Zap, Calendar, MessageSquare, Paperclip, Send, Clock, CheckCircle2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProctoredExamDialog } from '@/components/ProctoredExamDialog';
import { assignmentsService } from '@/services/assignments.service';
import { useToast } from '@/hooks/use-toast';

const TYPE_ICONS: Record<string, typeof FileText> = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: MessageSquare,
};

interface Submission {
  id: string;
  content: string;
  timestamp: string;
  status: 'draft' | 'submitted' | 'late' | 'under_review' | 'graded';
  driveFileName?: string | null;
  driveViewLink?: string | null;
}

interface ApiSubmission {
  id: string;
  content: string | null;
  drive_file_name: string | null;
  drive_view_link: string | null;
  submitted_at: string;
  status: 'draft' | 'submitted' | 'late' | 'under_review' | 'graded';
}

interface ApiAssignmentComment {
  id: string;
  content: string;
  created_at: string;
  author?: {
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    role?: string;
  } | null;
}

interface AssignmentComment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
}

interface AssignmentDetailDialogProps {
  assignment: Assignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherName: string;
  classId: string;
}

export function AssignmentDetailDialog({ assignment, open, onOpenChange, teacherName, classId }: AssignmentDetailDialogProps) {
  const { currentUserAvatar } = useRole();
  const { toast } = useToast();
  const [submissionText, setSubmissionText] = useState('');
  const [driveReference, setDriveReference] = useState('');
  const [driveFileName, setDriveFileName] = useState('');
  const [examOpen, setExamOpen] = useState(false);
  const [submission, setSubmission] = useState<ApiSubmission | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [newComment, setNewComment] = useState('');

  if (!assignment) return null;
  const isExamAssignment = assignment.rawType === 'exam';
  const Icon = TYPE_ICONS[assignment.type] || FileText;

  const mapApiComment = useCallback((comment: ApiAssignmentComment): AssignmentComment => {
    const firstName = comment.author?.first_name?.trim() || '';
    const lastName = comment.author?.last_name?.trim() || '';
    const authorName = `${firstName} ${lastName}`.trim() || comment.author?.email || 'User';
    const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || authorName.slice(0, 2).toUpperCase();

    return {
      id: comment.id,
      author: authorName,
      avatar,
      content: comment.content,
      timestamp: new Date(comment.created_at).toLocaleString(),
    };
  }, []);

  const extractDriveFileId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
      return trimmed;
    }

    const patterns = [
      /\/d\/([a-zA-Z0-9_-]{10,})/,
      /[?&]id=([a-zA-Z0-9_-]{10,})/,
      /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  };

  const loadSubmission = useCallback(async () => {
    if (!assignment?.id) return;

    setLoadingSubmission(true);
    try {
      const response = await assignmentsService.getMySubmission(classId, assignment.id);
      const apiSubmission = (response as any)?.data as ApiSubmission | null | undefined;
      setSubmission(apiSubmission || null);
    } catch {
      setSubmission(null);
    } finally {
      setLoadingSubmission(false);
    }
  }, [assignment?.id, classId]);

  const loadComments = useCallback(async () => {
    if (!assignment?.id) return;

    setCommentsLoading(true);
    try {
      const response = await assignmentsService.getComments(assignment.id);
      const apiComments = Array.isArray((response as any)?.data)
        ? ((response as any).data as ApiAssignmentComment[])
        : [];
      setComments(apiComments.map(mapApiComment));
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load comments';
      toast({
        title: 'Comments unavailable',
        description: message,
        variant: 'destructive',
      });
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [assignment?.id, mapApiComment, toast]);

  useEffect(() => {
    if (!open || !assignment?.id) return;

    setSubmissionText('');
    setDriveReference('');
    setDriveFileName('');
    setNewComment('');
    void loadSubmission();
    void loadComments();
  }, [assignment?.id, loadComments, loadSubmission, open]);

  const submissions = useMemo<Submission[]>(() => {
    if (!submission) return [];
    return [
      {
        id: submission.id,
        content: submission.content || 'No submission text provided.',
        timestamp: new Date(submission.submitted_at).toLocaleString(),
        status: submission.status,
        driveFileName: submission.drive_file_name,
        driveViewLink: submission.drive_view_link,
      },
    ];
  }, [submission]);

  const handleSubmit = async () => {
    if (!assignment?.id) return;

    const driveFileId = extractDriveFileId(driveReference);
    if (!driveFileId) {
      toast({
        title: 'Drive file is required',
        description: 'Paste a valid Google Drive file ID or share link before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await assignmentsService.submitAssignment(classId, assignment.id, {
        drive_file_id: driveFileId,
        drive_file_name: driveFileName.trim() || 'Drive Submission',
        content: submissionText.trim() || undefined,
      });

      await loadSubmission();
      setSubmissionText('');

      if (result.queued) {
        toast({
          title: 'Submission queued',
          description: result.message || 'Your submission will sync automatically when online.',
        });
      } else {
        toast({
          title: 'Assignment submitted',
          description: 'Your work has been submitted successfully.',
        });
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to submit assignment';

      toast({
        title: 'Submission failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleComment = async () => {
    if (!assignment?.id || !newComment.trim()) return;

    setPostingComment(true);
    try {
      const response = await assignmentsService.createComment(assignment.id, newComment.trim());
      const createdComment = (response as any)?.data as ApiAssignmentComment | undefined;

      if (createdComment) {
        setComments((previous) => [...previous, mapApiComment(createdComment)]);
      } else {
        await loadComments();
      }

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
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-dvw sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-3 sm:p-6">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${assignment.status === 'late' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${assignment.status === 'late' ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg break-words">{assignment.title}</DialogTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{teacherName} • {assignment.points} points</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
            <Calendar className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Due </span>{new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Badge>
          <Badge variant={assignment.status === 'late' ? 'destructive' : 'secondary'} className="rounded-lg capitalize text-xs sm:text-sm">
            {assignment.status}
          </Badge>
          {assignment.attachments && (
            <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
              <Paperclip className="h-3 w-3 mr-1" /> {assignment.attachments}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="bg-secondary/50 p-1 rounded-xl w-full overflow-x-auto flex">
            <TabsTrigger value="details" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">Details</TabsTrigger>
            <TabsTrigger value="comments" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">
              <span className="hidden sm:inline">Comments</span><span className="sm:hidden">Cmnts</span> ({comments.length})
            </TabsTrigger>
            <TabsTrigger value="submissions" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">
              <span className="hidden sm:inline">My Submissions</span><span className="sm:hidden">Submit</span> ({submissions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3 sm:space-y-4 mt-4">
            <div>
              <h4 className="font-semibold text-xs sm:text-sm mb-2">Instructions</h4>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{assignment.description}</p>
            </div>
            <div>
              <h4 className="font-semibold text-xs sm:text-sm mb-2">Guidelines</h4>
              <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 sm:space-y-1.5 list-disc pl-4">
                <li>Submit your work before the deadline</li>
                <li>Follow the formatting requirements outlined in class</li>
                <li>Original work only — cite all references properly</li>
                <li>Late submissions will receive a 10% penalty per day</li>
              </ul>
            </div>
            <Card className="border-0 shadow-sm bg-primary/5">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">SC</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-xs sm:text-sm">{teacherName}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Please reach out during office hours if you have questions. Good luck!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="pt-2">
              <h4 className="font-semibold text-xs sm:text-sm mb-2">
                {isExamAssignment ? 'Proctored Exam' : 'Submit Your Work'}
              </h4>

              {isExamAssignment ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    This is a proctored exam. Fullscreen, focus changes, and restricted interactions are monitored during your attempt.
                  </p>
                  <Button
                    size="sm"
                    className="rounded-xl text-xs sm:text-sm"
                    onClick={() => setExamOpen(true)}
                  >
                    <Send className="h-4 w-4 mr-1" /> Start Proctored Exam
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={driveReference}
                    onChange={(e) => setDriveReference(e.target.value)}
                    placeholder="Paste Google Drive file ID or link"
                    className="rounded-xl border-0 bg-secondary/50 text-sm"
                  />
                  <Input
                    value={driveFileName}
                    onChange={(e) => setDriveFileName(e.target.value)}
                    placeholder="Optional file name"
                    className="rounded-xl border-0 bg-secondary/50 text-sm"
                  />
                  <Textarea
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    placeholder="Optional notes or submission details..."
                    className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[100px] text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Submissions require a Google Drive file so teachers can review and grade directly.
                  </p>
                  <div className="flex justify-end mt-3">
                    <Button
                      size="sm"
                      className="rounded-xl text-xs sm:text-sm"
                      disabled={!driveReference.trim() || submitting}
                      onClick={() => {
                        void handleSubmit();
                      }}
                    >
                      <Send className="h-4 w-4 mr-1" /> Submit
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="comments" className="space-y-3 mt-4">
            <div className="space-y-2 sm:space-y-3 max-h-[300px] overflow-y-auto">
              {commentsLoading ? (
                <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">Loading comments...</p>
              ) : comments.length > 0 ? (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2 sm:gap-3 items-start">
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">{c.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 bg-secondary/30 rounded-lg sm:rounded-xl p-2 sm:p-3 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                        <span className="font-medium text-xs sm:text-sm truncate">{c.author}</span>
                        <span className="text-xs text-muted-foreground">{c.timestamp}</span>
                      </div>
                      <p className="text-xs sm:text-sm mt-1 break-words">{c.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">No comments yet</p>
              )}
            </div>
            <div className="flex gap-2 pt-2 flex-col sm:flex-row">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[60px] flex-1 text-sm"
              />
              <Button
                size="icon"
                className="rounded-xl self-end"
                disabled={!newComment.trim() || postingComment}
                onClick={() => {
                  void handleComment();
                }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-2 sm:space-y-3 mt-4">
            {loadingSubmission ? (
              <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">Loading submission...</p>
            ) : submissions.map((s) => (
              <Card key={s.id} className="border-0 shadow-sm">
                <CardContent className="p-2 sm:p-4">
                  <div className="flex flex-col gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="flex items-center gap-2">
                      {s.status === 'graded' ? (
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium capitalize">{s.status}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="text-xs text-muted-foreground">{s.timestamp}</span>
                      <Badge variant="secondary" className="text-xs w-fit capitalize">{s.status.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">{s.content}</p>
                  {s.driveFileName && (
                    <div className="p-2 sm:p-3 bg-primary/5 rounded-lg">
                      <p className="text-xs font-medium text-primary mb-1">Drive File</p>
                      {s.driveViewLink ? (
                        <a
                          href={s.driveViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs sm:text-sm text-primary underline break-all"
                        >
                          {s.driveFileName}
                        </a>
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground">{s.driveFileName}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!loadingSubmission && submissions.length === 0 && (
              <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">No submissions yet</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {assignment && classId && (
        <ProctoredExamDialog
          assignmentId={assignment.id}
          assignmentTitle={assignment.title}
          open={examOpen}
          onOpenChange={setExamOpen}
        />
      )}
    </Dialog>
  );
}
