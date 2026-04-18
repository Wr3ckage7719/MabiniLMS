import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Calendar,
  FileText,
  Tags,
  Edit2,
  Save,
  X,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { useAssignmentSubmissions } from '@/hooks/useTeacherData';
import {
  assignmentsService,
  SubmissionStatus,
  SubmissionStatusTimelineEntry,
} from '@/services/assignments.service';
import { gradesService } from '@/services/grades.service';
import { useToast } from '@/hooks/use-toast';
import { TeacherExamManagementPanel } from '@/components/TeacherExamManagementPanel';

interface StudentSubmission {
  id: string;
  name: string;
  avatar: string;
  status: SubmissionStatus;
  submittedDate?: string;
  grade?: string;
  gradeId?: string;
  feedback?: string | null;
  submissionText?: string;
  submissionUrl?: string;
}

interface AssignmentComment {
  id: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  isTeacher: boolean;
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

interface Topic {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  late: 'Late',
  under_review: 'Under Review',
  graded: 'Graded',
};

const getStatusBadgeVariant = (
  status: SubmissionStatus
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'graded':
      return 'default';
    case 'late':
      return 'destructive';
    case 'under_review':
      return 'secondary';
    case 'submitted':
      return 'outline';
    case 'draft':
    default:
      return 'outline';
  }
};

interface TeacherAssignmentDetailProps {
  classId: string;
  assignment: {
    id: string;
    title: string;
    description: string;
    dueDate: string;
    points: number;
    type: 'activity' | 'material';
    rawType?: string;
    topics: Topic[];
    acceptingSubmissions: boolean;
    submissionOpenAt?: string | null;
    submissionCloseAt?: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignmentChanged?: () => void;
}

const parseNumericGrade = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericPart = trimmed.includes('/') ? trimmed.split('/')[0] : trimmed;
  const parsed = Number.parseFloat(numericPart);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatOptionalTimestamp = (value?: string | null): string | null => {
  if (!value) return null;

  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }

  return timestamp.toLocaleString();
};

export function TeacherAssignmentDetail({
  classId,
  assignment,
  open,
  onOpenChange,
  onAssignmentChanged,
}: TeacherAssignmentDetailProps) {
  const { toast } = useToast();
  const {
    submissions: apiSubmissions,
    loading: submissionsLoading,
    error: submissionsError,
    refetch: refetchSubmissions,
  } = useAssignmentSubmissions(assignment?.id ?? null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(assignment?.title ?? '');
  const [editedDescription, setEditedDescription] = useState(
    assignment?.description ?? ''
  );
  const [editedDueDate, setEditedDueDate] = useState<Date | undefined>(
    assignment ? new Date(assignment.dueDate) : undefined
  );
  const [editedPoints, setEditedPoints] = useState(String(assignment?.points ?? 0));
  const [editedTopics, setEditedTopics] = useState<Topic[]>(
    assignment?.topics ?? []
  );
  const [newTopic, setNewTopic] = useState('');
  const [showNewTopicInput, setShowNewTopicInput] = useState(false);
  const [acceptingSubmissions, setAcceptingSubmissions] = useState(
    assignment?.acceptingSubmissions ?? true
  );
  const [submissionClosedAt, setSubmissionClosedAt] = useState<string | null>(
    assignment?.submissionCloseAt ?? null
  );
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<StudentSubmission | null>(null);
  const [submissionView, setSubmissionView] = useState<'list' | 'view-submission' | 'feedback'>('list');
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [savingGrade, setSavingGrade] = useState(false);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [updatingSubmissionSettings, setUpdatingSubmissionSettings] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [submissionTimeline, setSubmissionTimeline] = useState<SubmissionStatusTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [transitioningStatus, setTransitioningStatus] = useState(false);

  const mapApiComment = useCallback((comment: ApiAssignmentComment): AssignmentComment => {
    const firstName = comment.author?.first_name?.trim() || '';
    const lastName = comment.author?.last_name?.trim() || '';
    const authorName = `${firstName} ${lastName}`.trim() || comment.author?.email || 'User';
    const avatar =
      `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
      authorName.slice(0, 2).toUpperCase();

    return {
      id: comment.id,
      author: authorName,
      avatar,
      content: comment.content,
      timestamp: new Date(comment.created_at).toLocaleString(),
      isTeacher: ['teacher', 'admin'].includes((comment.author?.role || '').toLowerCase()),
    };
  }, []);

  const fetchComments = useCallback(async () => {
    if (!assignment?.id) return;

    setCommentsLoading(true);
    setCommentsError(null);
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
      setCommentsError(message);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [assignment?.id, mapApiComment]);

  const fetchSubmissionTimeline = useCallback(
    async (submissionId: string) => {
      setTimelineLoading(true);
      try {
        const response = await assignmentsService.getSubmissionTimeline(submissionId);
        const rootData = (response as any)?.data;
        const timeline = Array.isArray(rootData)
          ? rootData
          : Array.isArray(rootData?.data)
            ? rootData.data
            : [];
        setSubmissionTimeline(timeline as SubmissionStatusTimelineEntry[]);
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to load submission timeline';
        toast({
          title: 'Timeline unavailable',
          description: message,
          variant: 'destructive',
        });
        setSubmissionTimeline([]);
      } finally {
        setTimelineLoading(false);
      }
    },
    [toast]
  );

  // Handle Escape key to return to student list
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedSubmission) {
        setSelectedSubmission(null);
        setSubmissionView('list');
        setGradeInput('');
        setFeedbackText('');
        setRevisionReason('');
        setSubmissionTimeline([]);
        setActiveTab('submissions');
      }
    };

    if (selectedSubmission) {
      window.addEventListener('keydown', handleEscapeKey);
      return () => window.removeEventListener('keydown', handleEscapeKey);
    }
  }, [selectedSubmission]);

  useEffect(() => {
    if (!assignment) return;

    setEditedTitle(assignment.title ?? '');
    setEditedDescription(assignment.description ?? '');
    setEditedDueDate(assignment.dueDate ? new Date(assignment.dueDate) : undefined);
    setEditedPoints(String(assignment.points ?? 0));
    setEditedTopics(assignment.topics ?? []);
    setAcceptingSubmissions(assignment.acceptingSubmissions ?? true);
    setSubmissionClosedAt(assignment.submissionCloseAt ?? null);
    setComments([]);
    setCommentsError(null);
    setSelectedSubmission(null);
    setSubmissionView('list');
    setGradeInput('');
    setFeedbackText('');
    setRevisionReason('');
    setSubmissionTimeline([]);
    setActiveTab('details');
  }, [assignment]);

  useEffect(() => {
    if (!open || !assignment?.id) return;
    void fetchComments();
  }, [assignment?.id, fetchComments, open]);

  useEffect(() => {
    const mappedSubmissions: StudentSubmission[] = apiSubmissions.map((submission) => {
      const firstName = submission.student?.first_name?.trim() || '';
      const lastName = submission.student?.last_name?.trim() || '';
      const studentName = `${firstName} ${lastName}`.trim() || submission.student?.email || 'Student';
      const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || studentName.slice(0, 2).toUpperCase();
      const normalizedGrade = Array.isArray((submission as any).grade)
        ? (submission as any).grade[0]
        : (submission as any).grade;
      const normalizedStatus =
        (submission.status as SubmissionStatus | undefined) ||
        (normalizedGrade ? 'graded' : 'submitted');

      return {
        id: submission.id,
        name: studentName,
        avatar,
        status: normalizedStatus,
        submittedDate: new Date(submission.submitted_at).toLocaleString(),
        grade:
          typeof normalizedGrade?.points_earned === 'number'
            ? String(normalizedGrade.points_earned)
            : undefined,
        gradeId: normalizedGrade?.id,
        feedback: normalizedGrade?.feedback ?? null,
        submissionText: submission.content || submission.submission_text || undefined,
        submissionUrl: submission.drive_view_link || submission.submission_url || undefined,
      };
    });

    setSubmissions(mappedSubmissions);
  }, [apiSubmissions]);

  if (!assignment) return null;

  const isExamAssignment = assignment.rawType === 'exam';

  const handleSaveChanges = async () => {
    if (!assignment?.id) return;

    const parsedPoints = Number.parseInt(editedPoints, 10);
    if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
      toast({
        title: 'Invalid points',
        description: 'Points must be a non-negative number.',
        variant: 'destructive',
      });
      return;
    }

    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      toast({
        title: 'Title required',
        description: 'Assignment title cannot be empty.',
        variant: 'destructive',
      });
      return;
    }

    setSavingAssignment(true);
    try {
      await assignmentsService.updateAssignment(classId, assignment.id, {
        title: trimmedTitle,
        description: editedDescription,
        due_date: editedDueDate ? editedDueDate.toISOString() : null,
        max_points: parsedPoints,
      });

      setIsEditing(false);
      onAssignmentChanged?.();
      toast({
        title: 'Assignment updated',
        description: 'Your changes were saved successfully.',
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update assignment';

      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async () => {
    if (!assignment?.id) return;

    setDeletingAssignment(true);
    try {
      await assignmentsService.deleteAssignment(classId, assignment.id);
      setShowDeleteConfirm(false);
      onAssignmentChanged?.();
      onOpenChange(false);
      toast({
        title: 'Assignment deleted',
        description: 'The assignment has been removed.',
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to delete assignment';

      toast({
        title: 'Delete failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeletingAssignment(false);
    }
  };

  const handleToggleAcceptingSubmissions = async () => {
    if (!assignment?.id) return;

    const nextValue = !acceptingSubmissions;
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      submissions_open: nextValue,
      submission_close_at: nextValue ? null : nowIso,
    };

    if (nextValue) {
      payload.submission_open_at = nowIso;
    }

    setUpdatingSubmissionSettings(true);
    try {
      await assignmentsService.updateAssignment(classId, assignment.id, payload);
      setAcceptingSubmissions(nextValue);
      setSubmissionClosedAt(nextValue ? null : nowIso);
      onAssignmentChanged?.();

      toast({
        title: nextValue ? 'Submissions opened' : 'Submissions closed',
        description: nextValue
          ? 'Students can submit work for this assignment.'
          : 'Students can no longer submit work for this assignment.',
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update submission settings';

      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingSubmissionSettings(false);
    }
  };

  const handleAddTopic = () => {
    if (!newTopic.trim()) return;
    const topic: Topic = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTopic.trim(),
    };
    setEditedTopics([...editedTopics, topic]);
    setNewTopic('');
    setShowNewTopicInput(false);
  };

  const handleRemoveTopic = (topicId: string) => {
    setEditedTopics(editedTopics.filter((t) => t.id !== topicId));
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    if (!assignment?.id) return;

    setPostingComment(true);
    try {
      const response = await assignmentsService.createComment(assignment.id, newComment.trim());
      const createdComment = (response as any)?.data as ApiAssignmentComment | undefined;

      if (createdComment) {
        setComments((prev) => [...prev, mapApiComment(createdComment)]);
      } else {
        await fetchComments();
      }

      setNewComment('');
      setCommentsError(null);
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

  const handleSaveGradeAndFeedback = async () => {
    if (!selectedSubmission) return;

    const hasGradeInput = gradeInput.trim().length > 0;
    const hasFeedbackInput = feedbackText.trim().length > 0;

    if (!hasGradeInput && !hasFeedbackInput) return;

    const parsedGrade = hasGradeInput ? parseNumericGrade(gradeInput) : null;
    if (hasGradeInput && (parsedGrade === null || parsedGrade < 0)) {
      toast({
        title: 'Invalid grade',
        description: 'Enter a valid numeric grade value.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedSubmission.gradeId && selectedSubmission.status === 'draft') {
      toast({
        title: 'Submission is draft',
        description: 'Move the submission to review before grading.',
        variant: 'destructive',
      });
      return;
    }

    setSavingGrade(true);
    try {
      if (
        !selectedSubmission.gradeId &&
        (selectedSubmission.status === 'submitted' || selectedSubmission.status === 'late')
      ) {
        await assignmentsService.transitionSubmissionStatus(
          selectedSubmission.id,
          'under_review',
          'Entered grading workflow'
        );
      }

      if (selectedSubmission.gradeId) {
        await gradesService.updateGrade(selectedSubmission.gradeId, {
          score: parsedGrade ?? undefined,
          feedback: hasFeedbackInput ? feedbackText.trim() : undefined,
        });
      } else {
        if (parsedGrade === null) {
          toast({
            title: 'Grade required',
            description: 'Provide a grade before saving feedback for a new submission.',
            variant: 'destructive',
          });
          return;
        }

        await assignmentsService.gradeSubmission(
          '',
          assignment.id,
          selectedSubmission.id,
          parsedGrade,
          hasFeedbackInput ? feedbackText.trim() : undefined
        );
      }

      await refetchSubmissions();
      toast({
        title: 'Submission updated',
        description: 'Grade and feedback were saved successfully.',
      });

      setSelectedSubmission(null);
      setSubmissionView('list');
      setGradeInput('');
      setFeedbackText('');
      setRevisionReason('');
      setSubmissionTimeline([]);
      setActiveTab('submissions');
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save grade and feedback';

      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingGrade(false);
    }
  };

  const handleTransitionSubmissionStatus = async (
    targetStatus: SubmissionStatus,
    reason?: string
  ) => {
    if (!selectedSubmission) return;

    const trimmedReason = reason?.trim();
    if (targetStatus === 'draft' && !trimmedReason) {
      toast({
        title: 'Revision reason required',
        description: 'Provide a reason before requesting a revision.',
        variant: 'destructive',
      });
      return;
    }

    setTransitioningStatus(true);
    try {
      if (targetStatus === 'draft') {
        await assignmentsService.requestSubmissionRevision(
          selectedSubmission.id,
          trimmedReason as string
        );
      } else {
        await assignmentsService.transitionSubmissionStatus(
          selectedSubmission.id,
          targetStatus,
          trimmedReason
        );
      }

      await refetchSubmissions();
      await fetchSubmissionTimeline(selectedSubmission.id);

      setSelectedSubmission((previous) =>
        previous
          ? {
              ...previous,
              status: targetStatus,
            }
          : null
      );

      if (targetStatus !== 'draft') {
        setRevisionReason('');
      }

      toast({
        title: 'Status updated',
        description: `Submission moved to ${STATUS_LABELS[targetStatus].toLowerCase()}.`,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to update submission status';

      toast({
        title: 'Status update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTransitioningStatus(false);
    }
  };

  const handleOpenSubmissionDetail = (submission: StudentSubmission) => {
    setSelectedSubmission(submission);
    setSubmissionView('view-submission');
    setGradeInput(submission.grade || '');
    setFeedbackText(submission.feedback || '');
    setRevisionReason('');
    void fetchSubmissionTimeline(submission.id);
    setActiveTab('submissions');
  };

  const getDisplayGrade = (grade: string | undefined) => {
    if (!grade) return '';
    // Extract numeric part if grade has "/" (e.g., "85/100" -> "85")
    const numericGrade = grade.split('/')[0];
    return `${numericGrade}/${editedPoints}`;
  };

  const submittedCount = submissions.filter((s) => s.status !== 'draft').length;
  const gradedCount = submissions.filter((s) => s.status === 'graded').length;
  const pendingCount = submissions.filter(
    (s) => s.status === 'submitted' || s.status === 'late' || s.status === 'under_review'
  ).length;

  // Handle dialog close - go back to list if viewing submission
  const handleDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (selectedSubmission) {
        // Go back to student list on Submissions tab
        setSelectedSubmission(null);
        setSubmissionView('list');
        setGradeInput('');
        setFeedbackText('');
        setRevisionReason('');
        setSubmissionTimeline([]);
        setActiveTab('submissions');
      } else {
        // Close the dialog
        onOpenChange(false);
      }
    } else {
      onOpenChange(true);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="w-dvw sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl">
          <DialogHeader className="flex flex-row items-start justify-between">
            <div className="flex-1">
              {selectedSubmission ? (
                <div>
                  <DialogTitle className="text-2xl mb-2">
                    {selectedSubmission.name}'s Submission
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {`${STATUS_LABELS[selectedSubmission.status]} on ${selectedSubmission.submittedDate}`}
                  </p>
                </div>
              ) : !isEditing ? (
                <div>
                  <DialogTitle className="text-2xl mb-2">
                    {editedTitle}
                  </DialogTitle>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="secondary" className="rounded-lg">
                      {editedPoints} points
                    </Badge>
                    <Badge
                      variant={
                        assignment?.type === 'activity' ? 'default' : 'secondary'
                      }
                      className="rounded-lg"
                    >
                      {assignment?.type === 'activity' ? 'Activity' : 'Material'}
                    </Badge>
                    {isExamAssignment && (
                      <Badge variant="outline" className="rounded-lg">
                        Exam
                      </Badge>
                    )}
                    <Badge
                      variant={acceptingSubmissions ? 'default' : 'destructive'}
                      className="rounded-lg"
                    >
                      {acceptingSubmissions
                        ? 'Accepting Submissions'
                        : 'Closed'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold">Title</label>
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">Points</label>
                    <Input
                      type="number"
                      value={editedPoints}
                      onChange={(e) => setEditedPoints(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
            {!selectedSubmission && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (isEditing) {
                    // Reset to current values if canceling
                    setEditedTitle(editedTitle);
                    setEditedDescription(editedDescription);
                    setEditedPoints(editedPoints);
                    setEditedTopics(editedTopics);
                  }
                  setIsEditing(!isEditing);
                }}
                className="h-8 w-8"
              >
                {isEditing ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Edit2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </DialogHeader>

          {selectedSubmission ? (
            <div className="space-y-6">
              {/* Submission Content */}
              {selectedSubmission.status !== 'draft' && (
                <div>
                  <h4 className="font-semibold text-sm mb-3">Submission</h4>
                  <Card className="border-0 shadow-sm bg-muted/50">
                    <CardContent className="p-4">
                      {selectedSubmission.submissionText || selectedSubmission.submissionUrl ? (
                        <div className="space-y-3 text-sm">
                          {selectedSubmission.submissionText && (
                            <p className="whitespace-pre-wrap break-words">
                              {selectedSubmission.submissionText}
                            </p>
                          )}
                          {selectedSubmission.submissionUrl && (
                            <a
                              href={selectedSubmission.submissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline break-all"
                            >
                              {selectedSubmission.submissionUrl}
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No submission content was provided.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Grade Input */}
              {selectedSubmission.status !== 'draft' && (
                <div>
                  <label className="text-sm font-semibold block mb-2">Grade</label>
                  <Input
                    type="text"
                    placeholder={`e.g., ${Math.floor(parseInt(editedPoints) * 0.85) || 85}`}
                    value={gradeInput}
                    onChange={(e) => setGradeInput(e.target.value)}
                    className="rounded-lg"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Will be saved as entered/{editedPoints}</p>
                </div>
              )}

              {/* Feedback Textarea */}
              <div>
                <label className="text-sm font-semibold block mb-2">Feedback</label>
                <Textarea
                  placeholder="Share constructive feedback with the student..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="rounded-lg min-h-24 resize-none"
                />
              </div>

              {selectedSubmission.status === 'under_review' && (
                <div>
                  <label className="text-sm font-semibold block mb-2">Revision Request Reason</label>
                  <Textarea
                    placeholder="Explain what needs to be revised before re-submission..."
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    className="rounded-lg min-h-20 resize-none"
                  />
                </div>
              )}

              <div>
                <h4 className="font-semibold text-sm mb-3">Status Timeline</h4>
                <Card className="border-0 shadow-sm bg-muted/30">
                  <CardContent className="p-4 space-y-3">
                    {timelineLoading ? (
                      <p className="text-sm text-muted-foreground">Loading timeline...</p>
                    ) : submissionTimeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No status transitions recorded yet.</p>
                    ) : (
                      submissionTimeline.map((entry) => {
                        const actorName =
                          `${entry.actor?.first_name || ''} ${entry.actor?.last_name || ''}`.trim() ||
                          entry.actor?.email ||
                          'System';

                        return (
                          <div key={entry.id} className="space-y-1 border-l-2 border-border pl-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={getStatusBadgeVariant(entry.to_status)} className="rounded-lg text-xs">
                                {STATUS_LABELS[entry.to_status]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">By {actorName}</p>
                            {entry.reason && <p className="text-sm">{entry.reason}</p>}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full ${isExamAssignment ? 'grid-cols-4' : 'grid-cols-3'} rounded-lg`}>
                <TabsTrigger value="details" className="rounded-md">
                  Details
                </TabsTrigger>
                <TabsTrigger value="submissions" className="rounded-md">
                  Submissions
                </TabsTrigger>
                <TabsTrigger value="comments" className="rounded-md">
                  Comments
                </TabsTrigger>
                {isExamAssignment && (
                  <TabsTrigger value="exam" className="rounded-md">
                    Exam
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Details Tab */}
            <TabsContent value="details" className="space-y-5 mt-6">
              {/* Description */}
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </h3>
                {!isEditing ? (
                  <Card className="border-0 bg-muted/30">
                    <CardContent className="p-4">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {editedDescription}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="rounded-lg min-h-32"
                  />
                )}
              </div>

              {/* Due Date */}
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Due Date
                </h3>
                {!isEditing ? (
                  <Card className="border-0 bg-muted/30">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">
                        {editedDueDate ? formatDate(editedDueDate) : 'No due date'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full rounded-lg justify-start text-left font-normal"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        {editedDueDate
                          ? formatDate(editedDueDate)
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={editedDueDate}
                        onSelect={setEditedDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {/* Topics */}
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  Topics
                </h3>
                {editedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {editedTopics.map((topic) => (
                      <div
                        key={topic.id}
                        className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2"
                      >
                        {topic.name}
                        {isEditing && (
                          <button
                            onClick={() => handleRemoveTopic(topic.id)}
                            className="hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {isEditing && (
                  <div>
                    {!showNewTopicInput ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg gap-2"
                        onClick={() => setShowNewTopicInput(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Add Topic
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Topic name..."
                          value={newTopic}
                          onChange={(e) => setNewTopic(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTopic();
                            }
                          }}
                          className="rounded-lg text-sm"
                          autoFocus
                        />
                        <Button
                          size="icon"
                          className="rounded-lg"
                          onClick={handleAddTopic}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => {
                            setShowNewTopicInput(false);
                            setNewTopic('');
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submissions Settings */}
              {assignment.type === 'activity' && (
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Submission Settings
                  </h3>
                  <Card className="border-0 bg-muted/30">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">Accept Submissions</p>
                          <p className="text-xs text-muted-foreground">
                            {acceptingSubmissions
                              ? 'Students can submit work'
                              : 'Submissions are closed'}
                          </p>
                          {!acceptingSubmissions && submissionClosedAt && (
                            <p className="text-xs text-muted-foreground">
                              Closed {formatOptionalTimestamp(submissionClosedAt)}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={acceptingSubmissions ? 'default' : 'outline'}
                          onClick={() => {
                            void handleToggleAcceptingSubmissions();
                          }}
                          disabled={savingAssignment || updatingSubmissionSettings}
                          className="rounded-lg"
                        >
                          {updatingSubmissionSettings
                            ? 'Updating...'
                            : acceptingSubmissions
                              ? 'Turn Off'
                              : 'Turn On'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Submissions Tab */}
            <TabsContent value="submissions" className="space-y-5 mt-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{submittedCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{gradedCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Graded</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{pendingCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Needs Grading</p>
                  </CardContent>
                </Card>
              </div>

              {/* Student List */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Student Work ({submissions.length})
                </h3>
                {submissionsLoading ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      Loading submissions...
                    </CardContent>
                  </Card>
                ) : submissionsError ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center space-y-3">
                      <p className="text-sm text-destructive">Failed to load submissions.</p>
                      <p className="text-xs text-muted-foreground">{submissionsError}</p>
                      <Button
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => void refetchSubmissions()}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                ) : submissions.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      No submissions yet.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {submissions.map((submission) => (
                      <Card
                        key={submission.id}
                        className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => handleOpenSubmissionDetail(submission)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  {submission.avatar}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-sm group-hover:text-primary transition-colors">
                                  {submission.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {`${STATUS_LABELS[submission.status]} • ${submission.submittedDate}`}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0">
                              {submission.status === 'graded' && submission.grade && (
                                <div className="text-right">
                                  <p className="font-semibold text-sm">
                                    {getDisplayGrade(submission.grade)}
                                  </p>
                                </div>
                              )}
                              <Badge
                                variant={getStatusBadgeVariant(submission.status)}
                                className="rounded-lg text-xs capitalize"
                              >
                                {STATUS_LABELS[submission.status]}
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments" className="space-y-4 mt-6">
              {/* Comments List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {commentsLoading && (
                  <p className="text-sm text-muted-foreground">Loading comments...</p>
                )}

                {!commentsLoading && commentsError && (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <p className="text-sm text-destructive">{commentsError}</p>
                      <Button
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => {
                          void fetchComments();
                        }}
                      >
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!commentsLoading && !commentsError && comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}

                {!commentsLoading && !commentsError && comments.map((comment) => (
                  <Card key={comment.id} className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback
                            className={cn(
                              comment.isTeacher
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            )}
                          >
                            {comment.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{comment.author}</p>
                            {comment.isTeacher && (
                              <Badge
                                variant="default"
                                className="text-xs rounded-full"
                              >
                                Teacher
                              </Badge>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {comment.timestamp}
                            </p>
                          </div>
                          <p className="text-sm text-foreground mt-1 break-words">
                            {comment.content}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Comment Input */}
              <div className="border-t pt-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Leave a comment for the class..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="rounded-lg min-h-20 resize-none text-sm"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={() => {
                      void handleAddComment();
                    }}
                    disabled={!newComment.trim() || postingComment}
                    className="rounded-lg gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {postingComment ? 'Posting...' : 'Comment'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {isExamAssignment && (
              <TabsContent value="exam">
                <TeacherExamManagementPanel
                  assignmentId={assignment.id}
                  active={open && activeTab === 'exam'}
                />
              </TabsContent>
            )}
          </Tabs>
          )}

          <DialogFooter className="mt-6 flex gap-2 justify-end">
            {selectedSubmission ? (
              <>
                {(selectedSubmission.status === 'submitted' || selectedSubmission.status === 'late') && (
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      void handleTransitionSubmissionStatus('under_review', 'Moved to review by teacher');
                    }}
                    disabled={savingGrade || transitioningStatus}
                  >
                    {transitioningStatus ? 'Updating...' : 'Move to Review'}
                  </Button>
                )}

                {selectedSubmission.status === 'under_review' && (
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      void handleTransitionSubmissionStatus('draft', revisionReason);
                    }}
                    disabled={savingGrade || transitioningStatus || !revisionReason.trim()}
                  >
                    {transitioningStatus ? 'Updating...' : 'Request Revision'}
                  </Button>
                )}

                {selectedSubmission.status === 'graded' && (
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      void handleTransitionSubmissionStatus('under_review', 'Reopened for review');
                    }}
                    disabled={savingGrade || transitioningStatus}
                  >
                    {transitioningStatus ? 'Updating...' : 'Reopen Review'}
                  </Button>
                )}

                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    setSelectedSubmission(null);
                    setSubmissionView('list');
                    setGradeInput('');
                    setFeedbackText('');
                    setRevisionReason('');
                    setSubmissionTimeline([]);
                    setActiveTab('submissions');
                  }}
                >
                  Back
                </Button>
                <Button
                  className="rounded-lg"
                  onClick={() => {
                    void handleSaveGradeAndFeedback();
                  }}
                  disabled={
                    savingGrade ||
                    transitioningStatus ||
                    selectedSubmission.status === 'draft' ||
                    (!gradeInput.trim() && !feedbackText.trim())
                  }
                >
                  {savingGrade ? 'Saving...' : 'Save Grade & Feedback'}
                </Button>
              </>
            ) : (
              <>
                {isEditing && (
                  <Button
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => setIsEditing(false)}
                    disabled={savingAssignment}
                  >
                    Cancel
                  </Button>
                )}
                {isEditing && (
                  <Button
                    className="rounded-lg gap-2"
                    onClick={() => {
                      void handleSaveChanges();
                    }}
                    disabled={savingAssignment}
                  >
                    <Save className="h-4 w-4" />
                    {savingAssignment ? 'Saving...' : 'Save Changes'}
                  </Button>
                )}
                {!isEditing && (
                  <Button
                    variant="destructive"
                    className="rounded-lg gap-2"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deletingAssignment}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Assignment
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this assignment? This action cannot
            be undone.
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel className="rounded-lg" disabled={deletingAssignment}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleDeleteAssignment();
              }}
              disabled={deletingAssignment}
            >
              {deletingAssignment ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
