import { useCallback, useEffect, useMemo, useState } from 'react';
import { Assignment } from '@/lib/data';
import { formatDueCountdown } from '@/lib/course-completion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Paperclip, Send, Clock, CheckCircle2, Calendar, Lock, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { useAssessmentLockState } from '@/hooks-api/useAssessmentGating';
import { getTaskTypeMeta } from '@/lib/task-types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { assignmentsService } from '@/services/assignments.service';
import { authService } from '@/services/auth.service';
import { useToast } from '@/hooks/use-toast';
import {
  formatProviderFileSize,
  normalizeSubmissionStorageMetadata,
} from '@/lib/submission-storage';


interface Submission {
  id: string;
  content: string;
  timestamp: string;
  status: 'draft' | 'submitted' | 'late' | 'under_review' | 'graded';
  providerLabel: string;
  providerFileId?: string | null;
  providerFileName?: string | null;
  providerViewLink?: string | null;
  providerMimeType?: string | null;
  providerSizeBytes?: number | null;
  snapshotAt?: string | null;
}

interface ApiSubmission {
  id: string;
  content: string | null;
  drive_file_id?: string | null;
  drive_file_name: string | null;
  drive_view_link: string | null;
  file_url?: string | null;
  storage_provider?: string | null;
  provider_file_id?: string | null;
  provider_file_name?: string | null;
  provider_view_link?: string | null;
  provider_revision_id?: string | null;
  provider_mime_type?: string | null;
  provider_size_bytes?: number | null;
  provider_checksum?: string | null;
  submission_snapshot_at?: string | null;
  storage_metadata_complete?: boolean;
  storage_consistency_issues?: Array<{
    code: string;
    message: string;
    severity: 'warning' | 'error';
    fallback_applied: boolean;
  }>;
  submission_text?: string | null;
  submission_url?: string | null;
  submitted_at: string;
  status: 'draft' | 'submitted' | 'late' | 'under_review' | 'graded';
}

interface ExamQuestionResult {
  question_id: string;
  prompt: string;
  item_type: string;
  points_possible: number;
  points_awarded: number;
  is_correct: boolean | null;
  selected_choice_index: number | null;
  answer_text: string | null;
  correct_choice_index: number | null;
  correct_answer_text: string | null;
  choices: string[];
  explanation: string | null;
}

interface ExamScoreSummary {
  attempt_id: string;
  score: number;
  max_score: number;
  percentage: number;
  answered_count: number;
  total_questions: number;
  violation_count: number;
  question_results: ExamQuestionResult[];
}

interface DrivePickerSelection {
  id: string;
  name: string;
  url?: string | null;
  mimeType?: string | null;
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
  onStartExam?: (assignment: Assignment) => void;
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
let googleApiScriptPromise: Promise<void> | null = null;

const loadGoogleApiScript = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    throw new Error('Google API is unavailable in this environment.');
  }

  if (googleApiScriptPromise) {
    return googleApiScriptPromise;
  }

  if ((window as any).gapi?.load && (window as any).google?.picker) {
    googleApiScriptPromise = Promise.resolve();
    return googleApiScriptPromise;
  }

  googleApiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google API script.'));
    document.body.appendChild(script);
  });

  return googleApiScriptPromise;
};

const loadGooglePickerApi = async (): Promise<void> => {
  await loadGoogleApiScript();

  const gapi = (window as any).gapi;
  if (!gapi?.load) {
    throw new Error('Google API client is unavailable.');
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error('Failed to initialize Google Picker.'));
      }
    };

    gapi.load('picker', { callback: finish, onerror: fail });
    window.setTimeout(fail, 10_000);
  });

  if (!(window as any).google?.picker) {
    throw new Error('Google Picker API is unavailable.');
  }
};

export function AssignmentDetailDialog({ assignment, open, onOpenChange, teacherName, classId, onStartExam }: AssignmentDetailDialogProps) {
  const { toast } = useToast();
  const [submissionText, setSubmissionText] = useState('');
  const [selectedDriveFile, setSelectedDriveFile] = useState<DrivePickerSelection | null>(null);
  const [openingPicker, setOpeningPicker] = useState(false);
  const [submission, setSubmission] = useState<ApiSubmission | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);
  const [terminalAttempt, setTerminalAttempt] = useState<{ id: string; status: string; started_at: string; ended_at: string | null } | null>(null);
  const [examScore, setExamScore] = useState<ExamScoreSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [newComment, setNewComment] = useState('');
  // `nowTick` re-renders the countdown badge every minute while the dialog
  // is open. The previous render compared `Date.now()` once at mount, so
  // "Due in 4 hours" stayed stale even after an hour passed in the same view.
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const countdown = useMemo(() => {
    void nowTick;
    return formatDueCountdown(assignment?.dueDate);
  }, [assignment?.dueDate, nowTick]);

  const assignmentRawType = (assignment?.rawType || '').toLowerCase();
  const isExamAssignment = assignmentRawType === 'exam' || assignmentRawType === 'quiz';
  const isQuizAssignment = assignmentRawType === 'quiz';
  const isActivityAssignment = assignmentRawType === 'activity';
  // Past-due is a soft client-side guard so the submit button reflects what
  // the server will accept. The server enforces the same cutoff in
  // assignments.submitAssignment / exams.startExamAttempt — touching nowTick
  // forces a re-eval on each minute tick so the button flips at the deadline
  // without requiring the dialog to be reopened.
  const isPastDue = useMemo(() => {
    void nowTick;
    if (!assignment?.dueDate) return false;
    const due = new Date(assignment.dueDate).getTime();
    return Number.isFinite(due) && Date.now() > due;
  }, [assignment?.dueDate, nowTick]);
  const submissionsClosed = assignment?.submissionsOpen === false || isPastDue;
  const taskMeta = getTaskTypeMeta(assignment?.rawType || assignment?.type);
  const Icon = taskMeta.icon;

  // Required-LM gating: students cannot submit/start until the configured
  // materials are completed. We refetch on dialog open so progress that
  // changed in another tab is reflected without a hard reload.
  const lockStateQuery = useAssessmentLockState(open && assignment?.id ? assignment.id : null);
  const lockState = lockStateQuery.data ?? null;
  const isLocked = Boolean(lockState?.locked);
  const lockedByGate = isLocked;

  const formatOptionalDateTime = (value?: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed.toLocaleString();
  };

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

  const loadSubmission = useCallback(async () => {
    if (!assignment?.id) return;

    const rawType = (assignment.rawType || '').toLowerCase();
    const isExamType = rawType === 'quiz' || rawType === 'exam';

    setLoadingSubmission(true);
    setTerminalAttempt(null);
    setExamScore(null);

    try {
      const [submissionResponse, attemptResponse] = await Promise.all([
        assignmentsService.getMySubmission(classId, assignment.id),
        isExamType ? assignmentsService.getMyExamAttempt(assignment.id).catch(() => null) : Promise.resolve(null),
      ]);

      const apiSubmission = (submissionResponse as any)?.data as ApiSubmission | null | undefined;
      setSubmission(apiSubmission || null);

      const attemptData = (attemptResponse as any)?.data?.attempt;
      const TERMINAL_STATUSES = new Set(['submitted', 'terminated', 'timed_out']);
      if (isExamType && attemptData && TERMINAL_STATUSES.has(attemptData.status)) {
        setTerminalAttempt({
          id: attemptData.id,
          status: attemptData.status,
          started_at: attemptData.started_at,
          ended_at: attemptData.ended_at ?? null,
        });

        // Fetch per-question results for the score card
        try {
          const resultsResponse = await assignmentsService.getExamAttemptResults(attemptData.id);
          const resultData = (resultsResponse as any)?.data as ExamScoreSummary | null | undefined;
          if (resultData) setExamScore(resultData);
        } catch {
          // Results unavailable — score card will fall back to summary from submission content
        }
      }
    } catch {
      setSubmission(null);
    } finally {
      setLoadingSubmission(false);
    }
  }, [assignment?.id, assignment?.rawType, classId]);

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
    if (!open) {
      return;
    }
    if (!assignment?.id) return;

    setSubmissionText('');
    setSelectedDriveFile(null);
    setNewComment('');
    void loadSubmission();
    void loadComments();
  }, [assignment?.id, loadComments, loadSubmission, open]);

  const submissions = useMemo<Submission[]>(() => {
    if (!submission) return [];

    const normalizedStorage = normalizeSubmissionStorageMetadata(submission);

    return [
      {
        id: submission.id,
        content:
          normalizedStorage.submissionText ||
          'No submission text provided.',
        timestamp: new Date(submission.submitted_at).toLocaleString(),
        status: submission.status,
        providerLabel: normalizedStorage.providerLabel,
        providerFileId: normalizedStorage.providerFileId,
        providerFileName: normalizedStorage.providerFileName,
        providerViewLink: normalizedStorage.providerViewLink,
        providerMimeType: normalizedStorage.providerMimeType,
        providerSizeBytes: normalizedStorage.providerSizeBytes,
        snapshotAt: normalizedStorage.snapshotAt,
      },
    ];
  }, [submission]);

  const handleSubmit = async () => {
    if (!assignment?.id) return;

    if (lockedByGate) {
      toast({
        title: 'Required materials not complete',
        description: 'Finish the required learning materials before submitting.',
        variant: 'destructive',
      });
      return;
    }

    const driveFileId = selectedDriveFile?.id;
    if (!driveFileId) {
      toast({
        title: 'Drive file is required',
        description: 'Select a Google Drive file before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const providerFileName = selectedDriveFile?.name?.trim() || 'Drive Submission';
      const result = await assignmentsService.submitAssignment(classId, assignment.id, {
        provider: 'google_drive',
        provider_file_id: driveFileId,
        provider_file_name: providerFileName,
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

  const openDrivePicker = async () => {
    if (submissionsClosed || openingPicker) {
      return;
    }

    if (!GOOGLE_API_KEY) {
      toast({
        title: 'Google Drive not configured',
        description: 'Set VITE_GOOGLE_API_KEY to enable Drive file selection.',
        variant: 'destructive',
      });
      return;
    }

    setOpeningPicker(true);
    try {
      const tokenResponse = await authService.refreshGoogleDriveToken();
      const accessToken = tokenResponse?.data?.access_token;

      if (!accessToken) {
        throw new Error('Missing Google access token. Please sign in again.');
      }

      await loadGooglePickerApi();

      const google = (window as any).google;
      const docsView = new google.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

      const picker = new google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setOrigin(window.location.origin)
        .setCallback((data: any) => {
          if (data?.action !== google.picker.Action.PICKED || !data.docs?.length) {
            return;
          }

          const doc = data.docs[0] || {};
          const name = doc.name || doc.title || 'Drive File';

          setSelectedDriveFile({
            id: doc.id,
            name,
            url: doc.url || doc.webViewLink || null,
            mimeType: doc.mimeType || null,
          });
        })
        .build();

      picker.setVisible(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to open the Google Drive picker.';

      toast({
        title: 'Drive picker unavailable',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setOpeningPicker(false);
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

  if (!assignment) {
    return null;
  }

  const handleStartExam = () => {
    if (!assignment || !onStartExam) return;
    if (lockedByGate) {
      toast({
        title: 'Required materials not complete',
        description: 'Finish the required learning materials before starting this assessment.',
        variant: 'destructive',
      });
      return;
    }
    onStartExam(assignment);
  };

  const hasFinalState = !!submission || !!terminalAttempt;
  let primaryAction: {
    label: string;
    onClick: () => void;
    disabled: boolean;
    icon: 'lock' | 'send';
  } | null = null;

  if (!loadingSubmission && !hasFinalState) {
    if (isQuizAssignment) {
      primaryAction = {
        label: lockedByGate ? 'Locked' : 'Start Quiz',
        onClick: () => handleStartExam(),
        disabled: lockedByGate,
        icon: lockedByGate ? 'lock' : 'send',
      };
    } else if (isExamAssignment) {
      primaryAction = {
        label: lockedByGate ? 'Locked' : 'Start Proctored Exam',
        onClick: () => handleStartExam(),
        disabled: lockedByGate,
        icon: lockedByGate ? 'lock' : 'send',
      };
    } else if (isActivityAssignment) {
      primaryAction = {
        label: lockedByGate
          ? 'Locked'
          : submissionsClosed
            ? 'Closed'
            : 'Submit',
        onClick: () => {
          void handleSubmit();
        },
        disabled: submissionsClosed || !selectedDriveFile || submitting || lockedByGate,
        icon: lockedByGate ? 'lock' : 'send',
      };
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl p-3 sm:p-6">
        <div aria-hidden className="md:hidden flex justify-center -mt-1 mb-1">
          <span className="block h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <DialogHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${assignment.status === 'late' ? 'bg-destructive/10' : taskMeta.iconBg}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${assignment.status === 'late' ? 'text-destructive' : taskMeta.iconText}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base sm:text-lg break-words">{assignment.title}</DialogTitle>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border shrink-0 ${taskMeta.badgeClass}`}>
                  {taskMeta.label}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{teacherName} • {assignment.points} points</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
            <Calendar className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Due </span>
            {new Date(assignment.dueDate).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Badge>
          {countdown && assignment.status !== 'submitted' && assignment.status !== 'graded' && (
            <Badge
              className={`rounded-lg text-sm sm:text-sm font-semibold whitespace-nowrap ${
                countdown.tone === 'overdue'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive'
                  : countdown.tone === 'soon'
                  ? 'bg-amber-500 text-white hover:bg-amber-500'
                  : 'bg-primary/10 text-primary hover:bg-primary/10'
              }`}
            >
              <Clock className="h-3.5 w-3.5 sm:h-3 sm:w-3 mr-1" />
              {countdown.label}
            </Badge>
          )}
          <Badge
            variant={assignment.status === 'late' ? 'destructive' : 'outline'}
            className="rounded-lg capitalize text-xs sm:text-sm"
          >
            {assignment.status}
          </Badge>
          {(assignment.status === 'submitted' || assignment.status === 'graded') && (
            <Badge className="rounded-lg text-xs sm:text-sm bg-emerald-100 text-emerald-700 border-emerald-200 border whitespace-nowrap">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Submitted
            </Badge>
          )}
          {assignment.attachments && (
            <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
              <Paperclip className="h-3 w-3 mr-1" /> {assignment.attachments}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="bg-secondary/50 p-1 rounded-xl w-full overflow-x-auto flex h-auto min-h-10 sm:min-h-9">
            <TabsTrigger value="details" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm min-h-9">
              Details
            </TabsTrigger>
            <TabsTrigger value="comments" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm min-h-9 gap-1.5">
              <span>Comments</span>
              {comments.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                  {comments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="submissions" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm min-h-9 gap-1.5">
              <span className="hidden sm:inline">My Submissions</span>
              <span className="sm:hidden">Submissions</span>
              {submissions.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                  {submissions.length}
                </span>
              )}
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
                {isQuizAssignment ? 'Quiz' : isExamAssignment ? 'Proctored Exam' : 'Submit Your Work'}
              </h4>

              {lockedByGate && lockState ? (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 sm:p-4 mb-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Lock className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-200">
                        Locked until required materials are complete
                      </p>
                      <p className="text-[11px] sm:text-xs text-amber-800/80 dark:text-amber-300/80">
                        {lockState.satisfied_count} of {lockState.required_count} complete
                      </p>
                    </div>
                  </div>
                  <ul className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-1 list-disc pl-5">
                    {lockState.missing.map((m) => (
                      <li key={m.required_id} className="break-words">
                        <span className="font-medium">{m.material_title}</span>
                        <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                          {' '}— {Math.round(m.current_progress_percent)}% / {Math.round(m.min_progress_percent)}%
                          {m.completed ? ' (completed)' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(isQuizAssignment || isExamAssignment) && (loadingSubmission || submission || terminalAttempt) ? (
                loadingSubmission ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Checking submission status…
                  </div>
                ) : submission ? (
                  <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 sm:p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                        Assessment Completed
                      </p>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-[10px]">
                        Done
                      </Badge>
                    </div>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
                      This assessment can only be taken once. Your submission has been recorded.
                    </p>
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      <p>Submitted: {new Date(submission.submitted_at).toLocaleString()}</p>
                      <p>Status: <span className="capitalize">{submission.status.replace('_', ' ')}</span></p>
                    </div>
                    <p className="text-[11px] text-muted-foreground italic">
                      See the &quot;My Submissions&quot; tab for your full submission details.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 sm:p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-semibold text-amber-900 dark:text-amber-200">
                        Assessment Ended
                      </p>
                    </div>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      {terminalAttempt?.status === 'terminated'
                        ? 'Your attempt was ended due to proctoring violations. You cannot retake this assessment.'
                        : 'Your attempt timed out. You cannot retake this assessment.'}
                    </p>
                    {terminalAttempt?.started_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Started: {new Date(terminalAttempt.started_at).toLocaleString()}
                        {terminalAttempt.ended_at ? ` · Ended: ${new Date(terminalAttempt.ended_at).toLocaleString()}` : ''}
                      </p>
                    )}
                  </div>
                )
              ) : isQuizAssignment ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-3">
                  <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc pl-4">
                    <li>Answer questions directly inside the app.</li>
                    <li>Your answers are saved automatically as you go.</li>
                    <li>You can review all questions before submitting.</li>
                    <li>Once you submit, your answers are final.</li>
                  </ul>
                  <Button
                    size="sm"
                    className="hidden md:inline-flex rounded-xl text-xs sm:text-sm"
                    onClick={handleStartExam}
                    disabled={lockedByGate}
                  >
                    {lockedByGate ? (
                      <>
                        <Lock className="h-4 w-4 mr-1" /> Locked
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" /> Start Quiz
                      </>
                    )}
                  </Button>
                </div>
              ) : isExamAssignment ? (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 sm:p-4 space-y-3">
                  <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 list-disc pl-4">
                    <li>This exam is <strong>proctored</strong> — your screen activity is monitored.</li>
                    <li>You will enter fullscreen when the exam starts. Do not exit it.</li>
                    <li>Tab switching, right-clicking, and clipboard use are tracked as violations.</li>
                    <li>Exceeding the violation limit may auto-submit or terminate your attempt.</li>
                    <li>Once submitted, answers cannot be changed.</li>
                  </ul>
                  <Button
                    size="sm"
                    className="hidden md:inline-flex rounded-xl text-xs sm:text-sm"
                    onClick={handleStartExam}
                    disabled={lockedByGate}
                  >
                    {lockedByGate ? (
                      <>
                        <Lock className="h-4 w-4 mr-1" /> Locked
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" /> Start Proctored Exam
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  {submissionsClosed && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 sm:p-4">
                      <p className="text-xs sm:text-sm text-destructive">
                        {isPastDue
                          ? 'This assessment is past its due date and is no longer accepting submissions.'
                          : 'Submissions are currently closed for this assignment.'}
                        {assignment?.submissionCloseAt && !isPastDue
                          ? ` Closed on ${formatOptionalDateTime(assignment.submissionCloseAt)}.`
                          : ''}
                      </p>
                    </div>
                  )}

                  {isActivityAssignment ? (
                    <>
                      <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 sm:p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-xs sm:text-sm font-medium">Google Drive file</p>
                            <p className="text-[11px] text-muted-foreground">
                              Choose the file you want to submit. We will share read access with your teacher.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-xs sm:text-sm"
                            disabled={submissionsClosed || openingPicker}
                            onClick={() => {
                              void openDrivePicker();
                            }}
                          >
                            {openingPicker
                              ? 'Opening...'
                              : selectedDriveFile
                                ? 'Change file'
                                : 'Select from Drive'}
                          </Button>
                        </div>

                        {selectedDriveFile ? (
                          <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-1">
                            <p className="text-xs sm:text-sm font-medium break-words">
                              {selectedDriveFile.name}
                            </p>
                            {selectedDriveFile.url ? (
                              <a
                                href={selectedDriveFile.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary underline break-all"
                              >
                                Open in Drive
                              </a>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground break-all">
                              File ID: {selectedDriveFile.id}
                            </p>
                            {selectedDriveFile.mimeType ? (
                              <p className="text-[11px] text-muted-foreground">
                                {selectedDriveFile.mimeType}
                              </p>
                            ) : null}
                            <div className="pt-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setSelectedDriveFile(null)}
                                disabled={submissionsClosed || submitting}
                              >
                                Clear selection
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            No file selected yet.
                          </p>
                        )}
                      </div>

                      <Textarea
                        value={submissionText}
                        onChange={(e) => setSubmissionText(e.target.value)}
                        placeholder="Optional notes or submission details..."
                        className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[100px] text-sm"
                        disabled={submissionsClosed || submitting}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Submissions require a Google Drive file so teachers can review and grade directly.
                      </p>
                      <div className="hidden md:flex justify-end mt-3">
                        <Button
                          size="sm"
                          className="rounded-xl text-xs sm:text-sm"
                          disabled={submissionsClosed || !selectedDriveFile || submitting || lockedByGate}
                          onClick={() => {
                            void handleSubmit();
                          }}
                        >
                          {lockedByGate ? (
                            <>
                              <Lock className="h-4 w-4 mr-1" /> Locked
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-1" /> {submissionsClosed ? 'Closed' : 'Submit'}
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-border/70 bg-secondary/40 p-3 sm:p-4">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Drive submissions are only available for activity assignments.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mobile-only sticky CTA strip — primary action always visible */}
            {primaryAction && (
              <>
                <div aria-hidden className="md:hidden h-16" />
                <div className="md:hidden sticky bottom-0 -mx-3 sm:-mx-6 px-3 sm:px-6 py-3 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                  <Button
                    size="lg"
                    className="w-full rounded-xl text-sm font-semibold min-h-11"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                    variant={primaryAction.icon === 'lock' ? 'secondary' : 'default'}
                  >
                    {primaryAction.icon === 'lock' ? (
                      <Lock className="h-4 w-4 mr-1.5" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    {primaryAction.label}
                  </Button>
                </div>
              </>
            )}
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
                aria-label="Send comment"
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
                  {(isQuizAssignment || isExamAssignment) ? (() => {
                    // Parse the JSON summary stored by the server on submission
                    let summary: { attempt_id?: string; answered_count?: number; total_questions?: number; raw_score?: number; max_question_score?: number; scaled_score?: number; violation_count?: number } | null = null;
                    try { summary = JSON.parse(s.content); } catch { /* not JSON */ }

                    const scoreData = examScore || null;
                    const score = scoreData?.score ?? summary?.scaled_score ?? null;
                    const maxScore = scoreData?.max_score ?? null;
                    const answered = scoreData?.answered_count ?? summary?.answered_count ?? null;
                    const total = scoreData?.total_questions ?? summary?.total_questions ?? null;
                    const violations = scoreData?.violation_count ?? summary?.violation_count ?? null;
                    const pct = scoreData?.percentage ?? (score !== null && maxScore ? Math.round((score / maxScore) * 100) : null);

                    return (
                      <div className="mb-2 space-y-3">
                        {/* Score summary */}
                        <div className="rounded-lg border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</div>
                            <div className="text-sm font-semibold">
                              {score !== null ? `${score}${maxScore ? `/${maxScore}` : ''}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Percentage</div>
                            <div className="text-sm font-semibold">{pct !== null ? `${pct}%` : '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Answered</div>
                            <div className="text-sm font-semibold">{answered !== null ? `${answered}/${total ?? '?'}` : '—'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Violations</div>
                            <div className="text-sm font-semibold">{violations !== null ? violations : '—'}</div>
                          </div>
                        </div>

                        {/* Per-question breakdown */}
                        {scoreData?.question_results && scoreData.question_results.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Question Breakdown</p>
                            {scoreData.question_results.map((qr, idx) => (
                              <div key={qr.question_id} className={`rounded-lg border p-2 sm:p-3 space-y-1 ${
                                qr.is_correct === true ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' :
                                qr.is_correct === false ? 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20' :
                                'border-border bg-muted/20'
                              }`}>
                                <div className="flex items-start gap-2">
                                  {qr.is_correct === true ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                  ) : qr.is_correct === false ? (
                                    <XCircle className="h-3.5 w-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                  )}
                                  <p className="text-xs font-medium leading-snug flex-1">
                                    <span className="text-muted-foreground mr-1">Q{idx + 1}.</span>
                                    {qr.prompt}
                                  </p>
                                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{qr.points_awarded}/{qr.points_possible} pts</span>
                                </div>

                                {qr.item_type !== 'short_answer' && qr.choices.length > 0 && (
                                  <div className="pl-5 space-y-0.5">
                                    {qr.choices.map((choice, ci) => {
                                      const isSelected = ci === qr.selected_choice_index;
                                      const isCorrect = ci === qr.correct_choice_index;
                                      return (
                                        <div key={ci} className={`flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5 ${
                                          isSelected && isCorrect ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' :
                                          isSelected && !isCorrect ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' :
                                          isCorrect ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' :
                                          'text-muted-foreground'
                                        }`}>
                                          <span className="font-mono text-[10px]">{String.fromCharCode(65 + ci)}.</span>
                                          <span>{choice}</span>
                                          {isSelected && <span className="ml-auto text-[9px] font-medium">{isCorrect ? '✓ Your answer' : '✗ Your answer'}</span>}
                                          {!isSelected && isCorrect && <span className="ml-auto text-[9px] font-medium text-emerald-600">Correct</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {qr.item_type === 'short_answer' && (
                                  <div className="pl-5 text-[11px] space-y-0.5">
                                    {qr.answer_text && (
                                      <p><span className="text-muted-foreground">Your answer:</span> <span className="font-medium">{qr.answer_text}</span></p>
                                    )}
                                    {qr.correct_answer_text && (
                                      <p><span className="text-muted-foreground">Correct answer:</span> <span className="font-medium text-emerald-700 dark:text-emerald-400">{qr.correct_answer_text}</span></p>
                                    )}
                                  </div>
                                )}

                                {qr.explanation && (
                                  <p className="pl-5 text-[11px] text-muted-foreground italic">{qr.explanation}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">{s.content}</p>
                  )}
                  {(s.providerFileName || s.providerViewLink || s.providerFileId) && (
                    <div className="p-2 sm:p-3 bg-primary/5 rounded-lg">
                      <p className="text-xs font-medium text-primary mb-1">
                        {s.providerLabel} File
                      </p>
                      {s.providerViewLink ? (
                        <a
                          href={s.providerViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs sm:text-sm text-primary underline break-all"
                        >
                          {s.providerFileName || 'Open submitted file'}
                        </a>
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {s.providerFileName || 'Submitted file'}
                        </p>
                      )}
                      {s.providerFileId && (
                        <p className="text-[11px] text-muted-foreground mt-1 break-all">
                          File ID: {s.providerFileId}
                        </p>
                      )}
                      {(s.providerMimeType || s.providerSizeBytes || s.snapshotAt) && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {[
                            s.providerMimeType || null,
                            formatProviderFileSize(s.providerSizeBytes),
                            s.snapshotAt
                              ? `Snapshot ${new Date(s.snapshotAt).toLocaleString()}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
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
    </Dialog>
  );
}
