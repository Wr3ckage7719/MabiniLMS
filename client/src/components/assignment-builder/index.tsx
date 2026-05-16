import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  FileText,
  Activity,
  BookOpen,
  ClipboardCheck,
  Mic,
  FolderOpen,
  Calendar as CalendarIcon,
  Paperclip,
  X,
  Plus,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { assignmentsService } from '@/services/assignments.service';
import { examsService, type CreateExamQuestionPayload } from '@/services/exams.service';
import { materialsService } from '@/services/materials.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  type QuizBuilderQuestion,
  type ImportedQuestionDraft,
  type QuizQuestionType,
  createQuizDraftQuestion,
  parseQuestionImportFile,
  downloadQuestionImportTemplate,
} from './lib/quiz-import';
import { inferMaterialTypeFromFile } from './lib/attachment-upload';
import { ReadingMaterialForm } from './ReadingMaterialForm';
import { ActivityForm, type ActivityMode } from './ActivityForm';
import { QuizForm } from './QuizForm';
import { ExamForm } from './ExamForm';
import { RecitationForm, type RecitationMode } from './RecitationForm';
import { ProjectForm, type ProjectGroupMode } from './ProjectForm';

export type TaskType = 'reading_material' | 'activity' | 'quiz' | 'exam' | 'recitation' | 'project';

interface CreateAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
  onCreated?: () => void;
  initialTaskType?: TaskType;
  isPage?: boolean;
  lessonId?: string;
  mode?: 'create' | 'edit';
  assignmentId?: string;
}

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  file: File;
}

const TASK_LABELS: Record<TaskType, string> = {
  reading_material: 'Reading Material',
  activity: 'Activity',
  quiz: 'Quiz',
  exam: 'Exam',
  recitation: 'Recitation',
  project: 'Project',
};

const TASK_HELP_TEXT: Record<TaskType, string> = {
  reading_material: 'Upload PDF, DOCX, or PPT resources students can view in-app with per-student reading progress.',
  activity: 'Students submit files (PDF, DOCX, etc.) for teacher review and manual grading.',
  quiz: 'Build MCQ, True/False, or Short Answer questions. Students answer in-app and get instant auto-graded results.',
  exam: 'Proctored in-app exam with anti-cheat (fullscreen, tab-switch detection). Import questions or build inline.',
  recitation: 'Oral or recorded performance assessment. Teacher grades students live or reviews uploaded video.',
  project: 'Individual or group deliverable with file submission and manual grading.',
};

const TASK_PAGE_INTRO: Record<TaskType, string> = {
  reading_material: 'Publish class references to in-app storage and monitor who opened the material.',
  activity: 'Create traditional work such as essays, group activities, or assignments with direct file submission.',
  quiz: 'Build quiz questions, choose question types, and control random or sequential delivery.',
  exam: 'Set up proctored exam behavior, chapter pools, and delivery controls.',
  recitation: 'Configure recitation format, grading criteria, and submission window.',
  project: 'Set up individual or group project deliverables with file submission controls.',
};

const toEndOfDayISOString = (value?: Date): string | null => {
  if (!value) return null;
  const endOfDay = new Date(value);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.toISOString();
};

const combineDateAndTimeISOString = (date?: Date, time?: string): string | null => {
  if (!date) return null;
  const trimmed = (time || '').trim();
  if (!trimmed) return toEndOfDayISOString(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return toEndOfDayISOString(date);
  const hours = Math.max(0, Math.min(23, parseInt(match[1], 10) || 0));
  const minutes = Math.max(0, Math.min(59, parseInt(match[2], 10) || 0));
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result.toISOString();
};

const resolveCorrectChoiceIndex = (choices: string[], answerKey: string): number => {
  const normalized = answerKey.trim().toLowerCase();
  if (!normalized) return 0;
  const directIndex = choices.findIndex((choice) => choice.trim().toLowerCase() === normalized);
  if (directIndex >= 0) return directIndex;
  if (/^[a-z]$/i.test(normalized)) {
    const letterIndex = normalized.toUpperCase().charCodeAt(0) - 65;
    if (letterIndex >= 0 && letterIndex < choices.length) return letterIndex;
  }
  return 0;
};

const toExamQuestionPayload = (
  question: { type: QuizQuestionType; prompt: string; choices: string[]; answerKey: string; points?: number; explanation?: string; chapterTag?: string | null; imageUrl?: string | null },
  orderIndex: number
): CreateExamQuestionPayload | null => {
  const prompt = question.prompt.trim();
  if (!prompt) return null;
  const basePayload = { prompt, points: question.points, explanation: question.explanation || undefined, order_index: orderIndex, chapter_tag: question.chapterTag, image_url: question.imageUrl ?? null };
  if (question.type === 'multiple_choice') {
    const choices = question.choices.map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) return null;
    return { ...basePayload, item_type: 'multiple_choice', choices, correct_choice_index: resolveCorrectChoiceIndex(choices, question.answerKey) };
  }
  if (question.type === 'true_false') {
    const normalizedAnswer = question.answerKey.trim().toLowerCase();
    return { ...basePayload, item_type: 'true_false', choices: ['True', 'False'], correct_choice_index: normalizedAnswer === 'false' || normalizedAnswer === 'f' ? 1 : 0 };
  }
  const acceptedAnswers = question.answerKey.split('|').map((answer) => answer.trim()).filter(Boolean);
  if (acceptedAnswers.length === 0) return null;
  return { ...basePayload, item_type: 'short_answer', answer_payload: { accepted_answers: acceptedAnswers, case_sensitive: false } };
};

const toExamImportPayload = (question: ImportedQuestionDraft, orderIndex: number): CreateExamQuestionPayload | null =>
  toExamQuestionPayload(question, orderIndex);

const toExamBuilderPayload = (question: QuizBuilderQuestion, orderIndex: number): CreateExamQuestionPayload | null =>
  toExamQuestionPayload({ ...question, points: question.points && question.points > 0 ? question.points : 1 }, orderIndex);

const hasQuestionDraftContent = (question: QuizBuilderQuestion): boolean => {
  if (question.prompt.trim().length > 0) return true;
  if (question.answerKey.trim().length > 0) return true;
  if (question.type === 'multiple_choice') return question.choices.some((choice) => choice.trim().length > 0);
  return false;
};

export function CreateAssignmentDialog({
  open,
  onOpenChange,
  classId,
  onCreated,
  initialTaskType,
  isPage = false,
  lessonId,
  mode = 'create',
  assignmentId,
}: CreateAssignmentDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>(initialTaskType ?? 'activity');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string>('23:59');
  const [points, setPoints] = useState('100');
  const [readingProgressTracking, setReadingProgressTracking] = useState(true);
  const [readingSingleResourceMode, setReadingSingleResourceMode] = useState(true);
  const [activityMode, setActivityMode] = useState<ActivityMode>('assignment');
  const [activityAllowedFileTypes, setActivityAllowedFileTypes] = useState<string[]>(['pdf', 'docx', 'pptx']);
  const [submissionsOpen, setSubmissionsOpen] = useState(true);
  const [autoCloseSubmissionsOnDueDate, setAutoCloseSubmissionsOnDueDate] = useState(true);
  const [customSubmissionCloseDate, setCustomSubmissionCloseDate] = useState<Date | undefined>(undefined);
  const [quizQuestionOrder, setQuizQuestionOrder] = useState<'sequence' | 'random'>('sequence');
  const [quizOneQuestionAtATime, setQuizOneQuestionAtATime] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizBuilderQuestion[]>([createQuizDraftQuestion()]);
  const [quizImportFileName, setQuizImportFileName] = useState<string | null>(null);
  const [examQuestionOrder, setExamQuestionOrder] = useState<'sequence' | 'random'>('random');
  const [examQuestionSelection, setExamQuestionSelection] = useState<'sequence' | 'random'>('random');
  const [examQuestions, setExamQuestions] = useState<QuizBuilderQuestion[]>([createQuizDraftQuestion()]);
  const [examIntegrityProfile, setExamIntegrityProfile] = useState<'standard' | 'strict'>('strict');
  const [examRequireAgreementBeforeStart, setExamRequireAgreementBeforeStart] = useState(true);
  const [examAutoSubmitOnTabSwitch, setExamAutoSubmitOnTabSwitch] = useState(false);
  const [examAutoSubmitOnFullscreenExit, setExamAutoSubmitOnFullscreenExit] = useState(true);
  const [examMaxViolations, setExamMaxViolations] = useState('3');
  const [examOneQuestionAtATime, setExamOneQuestionAtATime] = useState(false);
  const [examTimerEnabled, setExamTimerEnabled] = useState(true);
  const [examDurationMinutes, setExamDurationMinutes] = useState('60');
  const [quizTimerEnabled, setQuizTimerEnabled] = useState(false);
  const [quizDurationMinutes, setQuizDurationMinutes] = useState('30');
  const [quizExamRestrictionsEnabled, setQuizExamRestrictionsEnabled] = useState(false);
  const [quizRequireFullscreen, setQuizRequireFullscreen] = useState(false);
  const [quizAutoSubmitOnTabSwitch, setQuizAutoSubmitOnTabSwitch] = useState(false);
  const [quizMaxViolations, setQuizMaxViolations] = useState('3');
  const [examImportedQuestions, setExamImportedQuestions] = useState<ImportedQuestionDraft[]>([]);
  const [examImportFileName, setExamImportFileName] = useState<string | null>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [topicDraft, setTopicDraft] = useState('');
  const [gradingPeriod, setGradingPeriod] = useState<'pre_mid' | 'midterm' | 'pre_final' | 'final' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [materialUploadProgress, setMaterialUploadProgress] = useState(0);
  const [uploadingMaterialName, setUploadingMaterialName] = useState<string | null>(null);
  const [uploadingMaterialId, setUploadingMaterialId] = useState<string | null>(null);
  const [completedMaterialId, setCompletedMaterialId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Recitation state
  const [recitationMode, setRecitationMode] = useState<RecitationMode>('in_class_oral');
  const [recitationCriteria, setRecitationCriteria] = useState('');
  // Project state
  const [projectGroupMode, setProjectGroupMode] = useState<ProjectGroupMode>('individual');
  const [projectGroupSize, setProjectGroupSize] = useState('4');
  const [projectAllowedFileTypes, setProjectAllowedFileTypes] = useState<string[]>(['pdf', 'docx', 'zip']);
  // Chapter pool state (for exam)
  const [examChapterPoolEnabled, setExamChapterPoolEnabled] = useState(false);
  const [examChapterPool, setExamChapterPool] = useState<Array<{ tag: string; count: number }>>([]);
  // Edit mode loading state
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  // Track server-side question IDs that existed at load time (for edit diff)
  const existingServerQuestionIds = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (initialTaskType) setTaskType(initialTaskType);
  }, [initialTaskType]);

  useEffect(() => {
    if (mode !== 'edit' || !assignmentId || !classId || !open) return;
    setIsLoadingEdit(true);
    Promise.all([
      assignmentsService.getAssignmentById(classId, assignmentId),
      assignmentsService.getAssignmentById(classId, assignmentId).then(() =>
        examsService.listExamQuestions(assignmentId).catch(() => [] as import('@/services/exams.service').ExamQuestion[])
      ),
    ]).then(async ([asgResp]) => {
      const rawAssignment = (asgResp as any)?.data?.assignment ?? (asgResp as any)?.data;
      if (!rawAssignment) return;
      const questionsResp = await examsService.listExamQuestions(assignmentId).catch(() => [] as import('@/services/exams.service').ExamQuestion[]);

      setTitle(rawAssignment.title ?? '');
      setDescription(rawAssignment.description ?? '');
      const rawType = rawAssignment.assignment_type ?? 'activity';
      const mappedType: TaskType = rawType === 'recitation' ? 'recitation' : rawType === 'project' ? 'project' : rawType === 'quiz' ? 'quiz' : rawType === 'exam' ? 'exam' : rawType === 'reading_material' ? 'reading_material' : 'activity';
      setTaskType(mappedType);
      if (rawAssignment.due_date) setDueDate(new Date(rawAssignment.due_date));
      if (rawAssignment.max_points != null) setPoints(String(rawAssignment.max_points));
      setGradingPeriod((rawAssignment.grading_period as typeof gradingPeriod) ?? '');
      setSubmissionsOpen(rawAssignment.submissions_open ?? true);
      setAutoCloseSubmissionsOnDueDate(!rawAssignment.submission_close_at || rawAssignment.submission_close_at === rawAssignment.due_date);
      if (rawAssignment.topics) setTopics(Array.isArray(rawAssignment.topics) ? rawAssignment.topics : []);

      if ((mappedType === 'exam' || mappedType === 'quiz') && questionsResp.length > 0) {
        const builderQuestions: QuizBuilderQuestion[] = questionsResp.map((q) => {
          let answerKey = '';
          if (q.item_type === 'true_false') answerKey = q.correct_choice_index === 0 ? 'True' : 'False';
          else if (q.item_type === 'multiple_choice') answerKey = String.fromCharCode(65 + q.correct_choice_index);
          else if (q.item_type === 'short_answer') {
            const accepted = (q.answer_payload as any)?.accepted_answers;
            answerKey = Array.isArray(accepted) ? accepted.join('|') : '';
          }
          return {
            id: `edit-${q.id}`,
            serverId: q.id,
            type: q.item_type === 'true_false' ? 'true_false' : q.item_type === 'short_answer' ? 'short_answer' : 'multiple_choice',
            prompt: q.prompt,
            choices: q.choices ?? [],
            answerKey,
            points: q.points,
            chapterTag: q.chapter_tag,
            imageUrl: q.image_url,
            explanation: q.explanation ?? undefined,
          };
        });
        existingServerQuestionIds.current = new Set(questionsResp.map((q) => q.id));
        if (mappedType === 'quiz') setQuizQuestions(builderQuestions);
        else setExamQuestions(builderQuestions);
      }

      if (rawAssignment.exam_duration_minutes) {
        setExamTimerEnabled(true);
        setExamDurationMinutes(String(rawAssignment.exam_duration_minutes));
      }
      if (rawAssignment.question_order_mode) setExamQuestionOrder(rawAssignment.question_order_mode);
      if (rawAssignment.exam_question_selection_mode) setExamQuestionSelection(rawAssignment.exam_question_selection_mode);
      const pool = rawAssignment.exam_chapter_pool;
      if (pool?.enabled) {
        setExamChapterPoolEnabled(true);
        setExamChapterPool(Array.isArray(pool.chapters) ? pool.chapters : []);
      }
    }).catch((err) => {
      toast({ title: 'Failed to load assessment', description: err?.message || 'Unable to load assessment data for editing.', variant: 'destructive' });
    }).finally(() => {
      setIsLoadingEdit(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, assignmentId, classId, open]);

  useEffect(() => {
    if (examIntegrityProfile === 'strict') {
      setExamRequireAgreementBeforeStart(true);
      setExamAutoSubmitOnFullscreenExit(true);
      setExamAutoSubmitOnTabSwitch(false);
      setExamMaxViolations('3');
      return;
    }
    setExamRequireAgreementBeforeStart(true);
    setExamAutoSubmitOnFullscreenExit(false);
    setExamAutoSubmitOnTabSwitch(false);
    setExamMaxViolations('5');
  }, [examIntegrityProfile]);

  const isTaskTypeLocked = isPage && Boolean(initialTaskType);

  const clearFieldError = (field: string) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const nextErrors = { ...prev };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (taskType !== 'reading_material' && !dueDate) newErrors.dueDate = 'Due date is required';
    if (taskType === 'reading_material' && files.length === 0) newErrors.readingMaterialFile = 'Attach a compatible file to continue';
    if (taskType !== 'reading_material') {
      const parsedPoints = Number(points);
      if (!Number.isFinite(parsedPoints) || parsedPoints < 0) newErrors.points = 'Points must be a non-negative number';
    }
    if (taskType === 'activity' && activityAllowedFileTypes.length === 0) newErrors.activityFileTypes = 'Select at least one allowed file type for activity submissions';
    if (taskType === 'project' && projectAllowedFileTypes.length === 0) newErrors.projectFileTypes = 'Select at least one allowed file type for project submissions';
    if (['activity', 'project'].includes(taskType) && submissionsOpen && !autoCloseSubmissionsOnDueDate && !customSubmissionCloseDate) {
      newErrors.customSubmissionCloseDate = 'Pick a custom close date or enable automatic closing on due date';
    }
    if (taskType === 'quiz') {
      const hasAnyQuestion = quizQuestions.some((question) => question.prompt.trim().length > 0);
      if (!hasAnyQuestion) newErrors.quizQuestions = 'Add at least one quiz question prompt';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting || isUploadingMaterial) { e.target.value = ''; return; }
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const acceptedFiles: AttachedFile[] = [];
    const rejectedFileNames: string[] = [];

    Array.from(selectedFiles).forEach((file) => {
      if (!inferMaterialTypeFromFile(file)) { rejectedFileNames.push(file.name); return; }
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      acceptedFiles.push({ id: Math.random().toString(36).substr(2, 9), name: file.name, size: `${fileSizeMB} MB`, type: file.type, file });
    });

    if (rejectedFileNames.length > 0) {
      const rejectedSummary = rejectedFileNames.slice(0, 3).join(', ');
      const suffix = rejectedFileNames.length > 3 ? ` +${rejectedFileNames.length - 3} more` : '';
      toast({ title: 'Unsupported file type rejected', description: `${rejectedSummary}${suffix}. Allowed: PDF, Office files, images, MP4/WEBM, ZIP.`, variant: 'destructive' });
    }

    if (acceptedFiles.length === 0) { e.target.value = ''; return; }

    setCompletedMaterialId(null);
    setUploadingMaterialId(null);

    if (taskType === 'reading_material' && readingSingleResourceMode) {
      setFiles(acceptedFiles.slice(-1));
      clearFieldError('readingMaterialFile');
      if (acceptedFiles.length > 1 || files.length > 0) {
        toast({ title: 'Single file mode enabled', description: 'Only the latest selected file will be attached for this reading material.' });
      }
    } else {
      setFiles((prev) => [...prev, ...acceptedFiles]);
      clearFieldError('readingMaterialFile');
    }
    e.target.value = '';
  };

  const removeFile = (fileId: string) => {
    if (isSubmitting || isUploadingMaterial) return;
    if (completedMaterialId === fileId) setCompletedMaterialId(null);
    if (uploadingMaterialId === fileId) setUploadingMaterialId(null);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const addTopic = () => {
    const value = topicDraft.trim();
    if (!value) return;
    if (value.length > 40) {
      toast({ title: 'Topic too long', description: 'Topics must be 40 characters or fewer.', variant: 'destructive' });
      return;
    }
    setTopics((prev) => {
      if (prev.length >= 10) {
        toast({ title: 'Topic limit reached', description: 'A task can have at most 10 topics.', variant: 'destructive' });
        return prev;
      }
      const exists = prev.some((entry) => entry.toLowerCase() === value.toLowerCase());
      return exists ? prev : [...prev, value];
    });
    setTopicDraft('');
  };

  const removeTopic = (topic: string) => { setTopics((prev) => prev.filter((entry) => entry !== topic)); };

  const toggleActivityFileType = (fileType: string, checked: boolean) => {
    setActivityAllowedFileTypes((prev) => {
      if (checked) { if (prev.includes(fileType)) return prev; return [...prev, fileType]; }
      return prev.filter((value) => value !== fileType);
    });
    clearFieldError('activityFileTypes');
  };

  const toggleProjectFileType = (fileType: string, checked: boolean) => {
    setProjectAllowedFileTypes((prev) => {
      if (checked) { if (prev.includes(fileType)) return prev; return [...prev, fileType]; }
      return prev.filter((value) => value !== fileType);
    });
    clearFieldError('projectFileTypes');
  };

  const addQuizQuestion = () => { setQuizQuestions((prev) => [...prev, createQuizDraftQuestion()]); clearFieldError('quizQuestions'); };
  const removeQuizQuestion = (questionId: string) => {
    setQuizQuestions((prev) => { if (prev.length <= 1) return prev; return prev.filter((q) => q.id !== questionId); });
  };
  const updateQuizQuestion = (questionId: string, update: Partial<QuizBuilderQuestion>) => {
    setQuizQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId) return question;
      const nextType = update.type ?? question.type;
      const typeChanged = update.type !== undefined && update.type !== question.type;
      const nextChoices = nextType === 'multiple_choice' ? (question.choices.length >= 4 ? question.choices : ['', '', '', '']) : [];
      const nextAnswerKey = typeChanged ? (nextType === 'true_false' ? 'true' : nextType === 'multiple_choice' ? 'A' : '') : (update.answerKey ?? question.answerKey);
      return { ...question, ...update, type: nextType, choices: update.choices ?? nextChoices, answerKey: nextAnswerKey };
    }));
    clearFieldError('quizQuestions');
  };
  const updateQuizChoice = (questionId: string, choiceIndex: number, value: string) => {
    setQuizQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId || question.type !== 'multiple_choice') return question;
      const nextChoices = [...question.choices];
      nextChoices[choiceIndex] = value;
      return { ...question, choices: nextChoices };
    }));
  };

  const addExamQuestion = () => { setExamQuestions((prev) => [...prev, createQuizDraftQuestion()]); };
  const removeExamQuestion = (questionId: string) => {
    setExamQuestions((prev) => { if (prev.length <= 1) return prev; return prev.filter((q) => q.id !== questionId); });
  };
  const updateExamQuestion = (questionId: string, update: Partial<QuizBuilderQuestion>) => {
    setExamQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId) return question;
      const nextType = update.type ?? question.type;
      const nextChoices = nextType === 'multiple_choice' ? (question.choices.length >= 4 ? question.choices : ['', '', '', '']) : [];
      return { ...question, ...update, type: nextType, choices: update.choices ?? nextChoices };
    }));
  };
  const updateExamChoice = (questionId: string, choiceIndex: number, value: string) => {
    setExamQuestions((prev) => prev.map((question) => {
      if (question.id !== questionId || question.type !== 'multiple_choice') return question;
      const nextChoices = [...question.choices];
      nextChoices[choiceIndex] = value;
      return { ...question, choices: nextChoices };
    }));
  };

  const handleImportQuestionFile = async (targetTask: 'quiz' | 'exam', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseQuestionImportFile(file);
      if (targetTask === 'quiz') {
        setQuizQuestions(result.questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, choices: q.choices, answerKey: q.answerKey })));
        setQuizImportFileName(file.name);
        clearFieldError('quizQuestions');
      } else {
        setExamImportedQuestions(result.questions);
        setExamImportFileName(file.name);
      }
      toast({
        title: 'Questions imported',
        description: result.skippedCount > 0
          ? `${result.questions.length} questions imported. ${result.skippedCount} rows were skipped.`
          : `${result.questions.length} questions imported from ${file.name}.`,
      });
    } catch (error: any) {
      toast({ title: 'Import failed', description: error?.message || 'Unable to import questions from the selected file.', variant: 'destructive' });
    } finally {
      event.target.value = '';
    }
  };

  const buildActivityInstructions = () => {
    const modeLabel = activityMode === 'essay_writing' ? 'Essay Writing' : activityMode === 'group_activity' ? 'Group Activity' : 'Assignment';
    const closePolicy = autoCloseSubmissionsOnDueDate ? 'Auto-close at due date' : customSubmissionCloseDate ? `Custom close: ${customSubmissionCloseDate.toISOString()}` : 'Manual close by teacher';
    return ['Activity Configuration', `Mode: ${modeLabel}`, `Allowed file types: ${activityAllowedFileTypes.join(', ')}`, 'Storage: Institutional Google Drive (teacher-visible student-owned files)', `Submission state: ${submissionsOpen ? 'Open' : 'Closed'}`, `Submission close policy: ${closePolicy}`].join('\n');
  };

  const buildRecitationInstructions = () => {
    return ['Recitation Configuration', `Mode: ${recitationMode}`, `Criteria: ${recitationCriteria || '(none)'}`, `Submission state: ${submissionsOpen ? 'Open' : 'Closed'}`].join('\n');
  };

  const buildProjectInstructions = () => {
    const groupLabel = projectGroupMode === 'group' ? `Group (max ${projectGroupSize})` : 'Individual';
    return ['Project Configuration', `Type: ${groupLabel}`, `Allowed file types: ${projectAllowedFileTypes.join(', ')}`, `Submission state: ${submissionsOpen ? 'Open' : 'Closed'}`].join('\n');
  };

  const buildQuizInstructions = () => {
    const questionBlueprint = quizQuestions.filter((q) => q.prompt.trim().length > 0).map((q) => ({
      type: q.type,
      prompt: q.prompt.trim(),
      choices: q.type === 'multiple_choice' ? q.choices.map((c) => c.trim()).filter(Boolean) : undefined,
      answer_key: q.answerKey.trim() || undefined,
    }));
    return ['Quiz Builder Configuration', JSON.stringify({ order_mode: quizQuestionOrder, import_source: quizImportFileName || null, questions: questionBlueprint }, null, 2)].join('\n');
  };

  const buildExamInstructions = () => {
    const examQuestionBlueprint = examQuestions.filter((q) => q.prompt.trim().length > 0).map((q) => ({
      type: q.type,
      prompt: q.prompt.trim(),
      choices: q.type === 'multiple_choice' ? q.choices.map((c) => c.trim()).filter(Boolean) : undefined,
      answer_key: q.answerKey.trim() || undefined,
    }));
    return ['Exam Builder Configuration', JSON.stringify({ order_mode: examQuestionOrder, selection_mode: examQuestionSelection, import_source: examImportFileName || null, builder_questions_count: examQuestionBlueprint.length, imported_questions_count: examImportedQuestions.length, questions: examQuestionBlueprint, policy: { require_agreement_before_start: examRequireAgreementBeforeStart, auto_submit_on_tab_switch: examAutoSubmitOnTabSwitch, auto_submit_on_fullscreen_exit: examAutoSubmitOnFullscreenExit, max_violations: Number(examMaxViolations) || 3 } }, null, 2)].join('\n');
  };

  const handleTaskTypeChange = (nextType: TaskType) => {
    setTaskType(nextType);
    if (nextType !== 'reading_material') { setUploadingMaterialId(null); setCompletedMaterialId(null); }
    clearFieldError('dueDate'); clearFieldError('points'); clearFieldError('activityFileTypes'); clearFieldError('quizQuestions');
  };

  const handleImageUpload = async (questionId: string, file: File): Promise<void> => {
    if (!classId) return;
    const currentAssignmentId = mode === 'edit' ? assignmentId : undefined;
    if (!currentAssignmentId) {
      toast({ title: 'Save the assessment first', description: 'Create the assessment before attaching question images.', variant: 'destructive' });
      return;
    }
    try {
      const url = await examsService.uploadQuestionImage(currentAssignmentId, file);
      setExamQuestions((prev) => prev.map((q) => q.id === questionId ? { ...q, imageUrl: url } : q));
      setQuizQuestions((prev) => prev.map((q) => q.id === questionId ? { ...q, imageUrl: url } : q));
    } catch {
      toast({ title: 'Image upload failed', description: 'Failed to upload question image. Try again.', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (isSubmitting || isUploadingMaterial) return;
    if (!validateForm()) return;
    if (!classId) {
      toast({ title: 'Missing class context', description: 'Open this dialog from a class page to create tasks.', variant: 'destructive' });
      return;
    }

    if (mode === 'edit' && assignmentId) {
      setIsSubmitting(true);
      try {
        const dueDateISO = combineDateAndTimeISOString(dueDate, dueTime);
        const submissionCloseAt = autoCloseSubmissionsOnDueDate ? dueDateISO : customSubmissionCloseDate ? toEndOfDayISOString(customSubmissionCloseDate) : null;
        const submissionOpenAt = submissionsOpen ? new Date().toISOString() : null;

        const patchPayload: Parameters<typeof assignmentsService.updateAssignment>[2] = {
          title: title.trim(),
          description: description.trim() || undefined,
          grading_period: gradingPeriod || null,
          due_date: dueDateISO ?? undefined,
          max_points: (taskType === 'quiz') ? Math.max(1, quizQuestions.reduce((s, q) => s + (q.points ?? 1), 0)) : (taskType === 'exam') ? Math.max(1, examQuestions.reduce((s, q) => s + (q.points ?? 1), 0)) : (Number(points) || 100),
          submissions_open: submissionsOpen,
          submission_open_at: submissionOpenAt,
          submission_close_at: submissionCloseAt,
          topics: topics.length > 0 ? topics : undefined,
          exam_duration_minutes: taskType === 'exam' && examTimerEnabled ? Math.max(1, parseInt(examDurationMinutes, 10) || 60) : null,
          question_order_mode: taskType === 'quiz' ? quizQuestionOrder : taskType === 'exam' ? examQuestionOrder : undefined,
          exam_question_selection_mode: taskType === 'exam' ? examQuestionSelection : undefined,
        };

        await assignmentsService.updateAssignment(classId, assignmentId, patchPayload);

        if (taskType === 'exam' || taskType === 'quiz') {
          const sourceQuestions = taskType === 'quiz' ? quizQuestions : examQuestions;
          const toSave = sourceQuestions.filter(hasQuestionDraftContent);
          const serverIds = existingServerQuestionIds.current;
          const keepServerIds = new Set(toSave.map((q) => q.serverId).filter(Boolean));

          // DELETE removed questions
          const deleteIds = [...serverIds].filter((id) => !keepServerIds.has(id));
          await Promise.allSettled(deleteIds.map((id) => examsService.deleteExamQuestion(assignmentId, id)));

          // PATCH updated + POST new
          await Promise.allSettled(toSave.map((q, index) => {
            const payload = toExamBuilderPayload(q, index);
            if (!payload) return Promise.resolve();
            if (q.serverId && serverIds.has(q.serverId)) {
              return examsService.updateExamQuestion(assignmentId, q.serverId, payload);
            }
            return examsService.createExamQuestion(assignmentId, payload);
          }));
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['assignments', classId] }),
          queryClient.invalidateQueries({ queryKey: ['assignment', classId, assignmentId] }),
          ...(lessonId ? [queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] })] : []),
        ]);

        toast({ title: 'Saved', description: `${TASK_LABELS[taskType]} updated successfully.` });
        onOpenChange(false);
        onCreated?.();
      } catch (error: any) {
        const message = error?.response?.data?.error?.message || error?.message || 'Failed to save changes';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    return handleCreate();
  };

  const handleCreate = async () => {
    if (isSubmitting || isUploadingMaterial) return;
    if (!validateForm()) return;
    if (!classId) {
      toast({ title: 'Missing class context', description: 'Open this dialog from a class page to create tasks.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (taskType === 'reading_material') {
        const attachedMaterial = files[0];
        const attachedMaterialFile = attachedMaterial?.file;
        if (!attachedMaterialFile) { setErrors((prev) => ({ ...prev, readingMaterialFile: 'Attach a compatible file to continue' })); return; }
        const resolvedMaterialType = inferMaterialTypeFromFile(attachedMaterialFile);
        if (!resolvedMaterialType) { toast({ title: 'Unsupported reading material file', description: 'Allowed: PDF, Office files, images, MP4/WEBM, ZIP.', variant: 'destructive' }); return; }

        setIsUploadingMaterial(true);
        setMaterialUploadProgress(0);
        setUploadingMaterialName(attachedMaterialFile.name);
        setUploadingMaterialId(attachedMaterial?.id || null);
        setCompletedMaterialId(null);

        await materialsService.create(classId, { title: title.trim(), type: resolvedMaterialType, file: attachedMaterialFile, lesson_id: lessonId }, {
          onUploadProgress: (progressEvent) => {
            const totalBytes = progressEvent.total || attachedMaterialFile.size;
            if (!totalBytes || totalBytes <= 0) return;
            const percent = Math.round((progressEvent.loaded / totalBytes) * 100);
            setMaterialUploadProgress(Math.min(100, Math.max(0, percent)));
          },
        });

        setMaterialUploadProgress(100);
        setCompletedMaterialId(attachedMaterial?.id || null);
        setUploadingMaterialId(null);
      } else {
        const assignmentType = taskType === 'quiz' ? 'quiz' : taskType === 'exam' ? 'exam' : taskType === 'recitation' ? 'recitation' : taskType === 'project' ? 'project' : 'activity';
        const parsedExamMaxViolations = Number(examMaxViolations);
        const effectiveExamMaxViolations = Number.isFinite(parsedExamMaxViolations) && parsedExamMaxViolations > 0 ? Math.floor(parsedExamMaxViolations) : examIntegrityProfile === 'strict' ? 3 : 5;
        const strictProctoring = examIntegrityProfile === 'strict';
        const dueDateISO = combineDateAndTimeISOString(dueDate, dueTime);
        const submissionCloseAt = autoCloseSubmissionsOnDueDate ? dueDateISO : customSubmissionCloseDate ? toEndOfDayISOString(customSubmissionCloseDate) : null;
        const submissionOpenAt = submissionsOpen ? new Date().toISOString() : null;
        const assignmentInstructions = taskType === 'activity' ? buildActivityInstructions() : taskType === 'quiz' ? buildQuizInstructions() : taskType === 'exam' ? buildExamInstructions() : taskType === 'recitation' ? buildRecitationInstructions() : taskType === 'project' ? buildProjectInstructions() : undefined;

        const createAssignmentResponse = await assignmentsService.createAssignment(classId, {
          title: title.trim(),
          description: description.trim() || undefined,
          assignment_type: assignmentType,
          grading_period: gradingPeriod || null,
          due_date: dueDateISO || new Date().toISOString(),
          max_points: taskType === 'quiz' ? Math.max(1, quizQuestions.reduce((s, q) => s + (q.points ?? 1), 0)) : taskType === 'exam' ? Math.max(1, examQuestions.reduce((s, q) => s + (q.points ?? 1), 0) + examImportedQuestions.reduce((s, q) => s + (q.points ?? 1), 0)) : (Number(points) || 100),
          submissions_open: submissionsOpen,
          submission_open_at: submissionOpenAt,
          submission_close_at: submissionCloseAt,
          instructions: assignmentInstructions,
          topics: topics.length > 0 ? topics : undefined,
          question_order_mode: taskType === 'quiz' ? quizQuestionOrder : taskType === 'exam' ? examQuestionOrder : undefined,
          exam_question_selection_mode: taskType === 'exam' ? examQuestionSelection : undefined,
          exam_duration_minutes: taskType === 'exam' && examTimerEnabled ? Math.max(1, parseInt(examDurationMinutes, 10) || 60) : taskType === 'quiz' && quizTimerEnabled ? Math.max(1, parseInt(quizDurationMinutes, 10) || 30) : null,
          is_proctored: taskType === 'exam' ? true : taskType === 'quiz' && quizExamRestrictionsEnabled ? true : undefined,
          proctoring_policy: taskType === 'exam' ? { max_violations: effectiveExamMaxViolations, require_agreement_before_start: examRequireAgreementBeforeStart, auto_submit_on_tab_switch: examAutoSubmitOnTabSwitch, auto_submit_on_fullscreen_exit: examAutoSubmitOnFullscreenExit, terminate_on_fullscreen_exit: examAutoSubmitOnFullscreenExit, block_clipboard: strictProctoring, block_context_menu: strictProctoring, block_print_shortcut: strictProctoring, one_question_at_a_time: examOneQuestionAtATime } : taskType === 'quiz' ? ({ one_question_at_a_time: quizOneQuestionAtATime, max_violations: quizExamRestrictionsEnabled ? Math.max(1, parseInt(quizMaxViolations, 10) || 3) : 999, require_agreement_before_start: false, auto_submit_on_tab_switch: quizExamRestrictionsEnabled && quizAutoSubmitOnTabSwitch, auto_submit_on_fullscreen_exit: quizExamRestrictionsEnabled && quizRequireFullscreen, terminate_on_fullscreen_exit: quizExamRestrictionsEnabled && quizRequireFullscreen, require_fullscreen: quizExamRestrictionsEnabled && quizRequireFullscreen, block_clipboard: false, block_context_menu: false, block_print_shortcut: false } as any) : undefined,
          lesson_id: lessonId,
        });

        const createdAssignmentId = String((createAssignmentResponse as { data?: { id?: string }; id?: string })?.data?.id || (createAssignmentResponse as { data?: { id?: string }; id?: string })?.id || '');

        if ((taskType === 'exam' || taskType === 'quiz') && createdAssignmentId) {
          const sourceBuilderQuestions = taskType === 'quiz' ? quizQuestions : examQuestions;
          const candidateBuilderQuestions = sourceBuilderQuestions.filter(hasQuestionDraftContent);
          const builderPayloads = candidateBuilderQuestions.map((q, index) => toExamBuilderPayload(q, index)).filter((payload): payload is CreateExamQuestionPayload => Boolean(payload));
          const importedPayloads = taskType === 'exam' ? examImportedQuestions.map((q, index) => toExamImportPayload(q, builderPayloads.length + index)).filter((payload): payload is CreateExamQuestionPayload => Boolean(payload)) : [];
          const mappedPayloads = [...builderPayloads, ...importedPayloads];
          if (mappedPayloads.length > 0) {
            await Promise.all(mappedPayloads.map((payload) => examsService.createExamQuestion(createdAssignmentId, payload)));
          }
          const sourceQuestionCount = candidateBuilderQuestions.length + (taskType === 'exam' ? examImportedQuestions.length : 0);
          const skippedOnSave = sourceQuestionCount - mappedPayloads.length;
          if (skippedOnSave > 0) {
            toast({ title: `${TASK_LABELS[taskType]} questions partially applied`, description: `${mappedPayloads.length} questions saved. ${skippedOnSave} skipped due to missing prompt, answer key, or choices.` });
          }
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments', classId] }),
        queryClient.invalidateQueries({ queryKey: ['materials', classId] }),
        ...(lessonId ? [queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] }), queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId] })] : []),
      ]);

      toast({ title: 'Created successfully', description: taskType === 'reading_material' ? 'Reading material created.' : `${TASK_LABELS[taskType]} task created.` });
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      const metadataFields = error?.response?.data?.error?.metadata?.fields;
      const firstFieldEntry = metadataFields && typeof metadataFields === 'object' ? Object.entries(metadataFields).find(([, value]) => Array.isArray(value) && value.length > 0) : undefined;
      const firstFieldMessage = firstFieldEntry ? `${firstFieldEntry[0]}: ${String(firstFieldEntry[1][0] || '').trim()}` : null;
      const message = firstFieldMessage || error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Failed to create task';
      toast({ title: 'Creation failed', description: message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setIsUploadingMaterial(false);
      setMaterialUploadProgress(0);
      setUploadingMaterialName(null);
      setUploadingMaterialId(null);
    }
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setTaskType(initialTaskType ?? 'activity'); setDueDate(undefined); setPoints('100');
    setReadingProgressTracking(true); setReadingSingleResourceMode(true); setActivityMode('assignment');
    setActivityAllowedFileTypes(['pdf', 'docx', 'pptx']); setSubmissionsOpen(true); setAutoCloseSubmissionsOnDueDate(true);
    setCustomSubmissionCloseDate(undefined); setQuizQuestionOrder('sequence'); setQuizQuestions([createQuizDraftQuestion()]); setQuizImportFileName(null);
    setExamQuestionOrder('random'); setExamQuestionSelection('random'); setExamQuestions([createQuizDraftQuestion()]); setExamIntegrityProfile('strict');
    setExamRequireAgreementBeforeStart(true); setExamAutoSubmitOnTabSwitch(false); setExamAutoSubmitOnFullscreenExit(true);
    setExamMaxViolations('3'); setExamImportedQuestions([]); setExamImportFileName(null);
    setGradingPeriod('');
    setRecitationMode('in_class_oral'); setRecitationCriteria('');
    setProjectGroupMode('individual'); setProjectGroupSize('4'); setProjectAllowedFileTypes(['pdf', 'docx', 'zip']);
    setExamChapterPoolEnabled(false); setExamChapterPool([]);
    existingServerQuestionIds.current = new Set();
    setFiles([]); setTopics([]); setTopicDraft(''); setIsSubmitting(false); setIsUploadingMaterial(false);
    setMaterialUploadProgress(0); setUploadingMaterialName(null); setUploadingMaterialId(null); setCompletedMaterialId(null); setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && (isSubmitting || isUploadingMaterial)) return;
    if (!newOpen) resetForm();
    onOpenChange(newOpen);
  };

  const taskOptions = [
    { id: 'reading_material' as const, label: 'Reading Material', description: 'Reference content and links', icon: BookOpen },
    { id: 'activity' as const, label: 'Activity', description: 'Submit files · Graded by teacher', icon: Activity },
    { id: 'quiz' as const, label: 'Quiz', description: 'In-app · Auto-graded · Instant results', icon: FileText },
    { id: 'exam' as const, label: 'Exam', description: 'Proctored assessment flow', icon: ClipboardCheck },
    { id: 'recitation' as const, label: 'Recitation', description: 'Oral or video assessment', icon: Mic },
    { id: 'project' as const, label: 'Project', description: 'Individual or group deliverable', icon: FolderOpen },
  ];

  const isEditMode = mode === 'edit';
  const createTaskButtonLabel = isUploadingMaterial ? `Uploading ${Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%` : isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : isEditMode ? 'Save changes' : taskType === 'reading_material' ? 'Create Reading Material' : `Create ${TASK_LABELS[taskType]}`;
  const isActionLocked = isSubmitting || isUploadingMaterial || isLoadingEdit;
  const taskIconMap: Record<TaskType, typeof FileText> = { reading_material: BookOpen, activity: Activity, quiz: FileText, exam: ClipboardCheck, recitation: Mic, project: FolderOpen };
  const SelectedTaskIcon = taskIconMap[taskType] ?? FileText;

  const examBuilderCandidateCount = examQuestions.filter(hasQuestionDraftContent).length;
  const examBuilderReadyCount = examQuestions.reduce((count, question, index) => {
    if (!hasQuestionDraftContent(question)) return count;
    return count + (toExamBuilderPayload(question, index) ? 1 : 0);
  }, 0);
  const examImportReadyCount = examImportedQuestions.reduce((count, question, index) => count + (toExamImportPayload(question, index) ? 1 : 0), 0);

  const actionButtons = (
    <>
      <Button variant="outline" className="rounded-lg" onClick={() => handleOpenChange(false)} disabled={isActionLocked}>Cancel</Button>
      <Button className="rounded-lg gap-2" onClick={handleSave} disabled={isActionLocked}>
        {isActionLocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <SelectedTaskIcon className="h-4 w-4" />}
        {createTaskButtonLabel}
      </Button>
    </>
  );

  const detailsSectionContent = (
    <div className="space-y-5">
      {isTaskTypeLocked ? (
        <Card className="border border-primary/25 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2 text-primary"><SelectedTaskIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-sm font-semibold">Task type locked for this page</p>
              <p className="text-xs text-muted-foreground mt-1">You selected {TASK_LABELS[taskType]} from the classwork menu. Fill out this page to publish it.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          <label className="text-sm font-semibold mb-3 block">Task Type</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {taskOptions.map((option) => {
              const Icon = option.icon;
              const selected = taskType === option.id;
              return (
                <button key={option.id} type="button" onClick={() => handleTaskTypeChange(option.id)}
                  className={cn('flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer text-left', selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 bg-card')}>
                  <div className={cn('p-2 rounded-lg', selected ? 'bg-primary/20' : 'bg-muted')}>
                    <Icon className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Card className="border-0 bg-muted/30">
        <CardContent className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium">Selected: {TASK_LABELS[taskType]}</div>
          <Badge variant="secondary" className="rounded-full w-fit">Task-specific workspace</Badge>
          <p className="text-xs text-muted-foreground sm:ml-2">{TASK_HELP_TEXT[taskType]}</p>
        </CardContent>
      </Card>

      <div>
        <label className="text-sm font-semibold">Title <span className="text-destructive">*</span></label>
        <input
          className={cn('flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-2 rounded-lg', errors.title && 'border-destructive')}
          placeholder={taskType === 'reading_material' ? 'e.g., Chapter 4 Reading Pack' : taskType === 'activity' ? 'e.g., Lab Activity 2' : taskType === 'quiz' ? 'e.g., Chapter 3 Quiz' : 'e.g., Midterm Proctored Exam'}
          value={title}
          onChange={(e) => { setTitle(e.target.value); clearFieldError('title'); }}
        />
        {errors.title && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.title}</p>}
      </div>

      <div>
        <label className="text-sm font-semibold">Description</label>
        <Textarea
          placeholder={taskType === 'reading_material' ? 'Optional summary, chapter notes, or reading guidance...' : 'Provide instructions, context, or details about the task...'}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-2 rounded-lg resize-none min-h-24"
        />
        <p className="text-xs text-muted-foreground mt-1">{description.length}/500 characters</p>
      </div>

      {taskType === 'reading_material' && (
        <ReadingMaterialForm
          readingProgressTracking={readingProgressTracking}
          setReadingProgressTracking={setReadingProgressTracking}
          readingSingleResourceMode={readingSingleResourceMode}
          setReadingSingleResourceMode={setReadingSingleResourceMode}
          readingMaterialFileError={errors.readingMaterialFile}
        />
      )}

      {taskType !== 'reading_material' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
          <div>
            <label className="text-sm font-semibold">Due Date <span className="text-destructive">*</span></label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full rounded-lg justify-start text-left font-normal', !dueDate && 'text-muted-foreground', errors.dueDate && 'border-destructive')}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dueDate ? formatDate(dueDate) : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={(date) => { setDueDate(date); clearFieldError('dueDate'); }} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus />
                </PopoverContent>
              </Popover>
              <Input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} aria-label="Due time" className="rounded-lg" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Students can't submit or open the assessment after this date and time.</p>
            {errors.dueDate && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.dueDate}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Grading Period</label>
            <Select value={gradingPeriod || '__none__'} onValueChange={(v) => setGradingPeriod(v === '__none__' ? '' : (v as typeof gradingPeriod))}>
              <SelectTrigger className="mt-2 rounded-lg bg-background"><SelectValue placeholder="Select period (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                <SelectItem value="pre_mid">Pre-Mid (25%)</SelectItem>
                <SelectItem value="midterm">Midterm (25%)</SelectItem>
                <SelectItem value="pre_final">Pre-Final (25%)</SelectItem>
                <SelectItem value="final">Final (25%)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Used for Mabini Colleges registrar grade export</p>
          </div>

          <div>
            <label className="text-sm font-semibold">Points</label>
            {(taskType === 'quiz' || taskType === 'exam') ? (
              <div className="mt-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Auto-sum from question points</span>
                <span className="font-semibold tabular-nums">
                  {taskType === 'quiz' ? quizQuestions.reduce((s, q) => s + (q.points ?? 1), 0) : examQuestions.reduce((s, q) => s + (q.points ?? 1), 0) + examImportedQuestions.reduce((s, q) => s + (q.points ?? 1), 0)}
                </span>
              </div>
            ) : (
              <>
                <Input type="number" min="0" value={points} onChange={(e) => { setPoints(e.target.value); clearFieldError('points'); }} className={cn('mt-2 rounded-lg', errors.points && 'border-destructive')} />
                {errors.points && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.points}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {taskType === 'activity' && (
        <ActivityForm
          activityMode={activityMode}
          setActivityMode={setActivityMode}
          activityAllowedFileTypes={activityAllowedFileTypes}
          toggleActivityFileType={toggleActivityFileType}
          submissionsOpen={submissionsOpen}
          setSubmissionsOpen={setSubmissionsOpen}
          autoCloseSubmissionsOnDueDate={autoCloseSubmissionsOnDueDate}
          setAutoCloseSubmissionsOnDueDate={setAutoCloseSubmissionsOnDueDate}
          customSubmissionCloseDate={customSubmissionCloseDate}
          setCustomSubmissionCloseDate={setCustomSubmissionCloseDate}
          activityFileTypesError={errors.activityFileTypes}
          customSubmissionCloseDateError={errors.customSubmissionCloseDate}
          clearFieldError={clearFieldError}
        />
      )}

      {taskType === 'quiz' && (
        <QuizForm
          quizQuestions={quizQuestions}
          quizQuestionOrder={quizQuestionOrder}
          setQuizQuestionOrder={setQuizQuestionOrder}
          quizOneQuestionAtATime={quizOneQuestionAtATime}
          setQuizOneQuestionAtATime={setQuizOneQuestionAtATime}
          quizTimerEnabled={quizTimerEnabled}
          setQuizTimerEnabled={setQuizTimerEnabled}
          quizDurationMinutes={quizDurationMinutes}
          setQuizDurationMinutes={setQuizDurationMinutes}
          quizExamRestrictionsEnabled={quizExamRestrictionsEnabled}
          setQuizExamRestrictionsEnabled={setQuizExamRestrictionsEnabled}
          quizRequireFullscreen={quizRequireFullscreen}
          setQuizRequireFullscreen={setQuizRequireFullscreen}
          quizAutoSubmitOnTabSwitch={quizAutoSubmitOnTabSwitch}
          setQuizAutoSubmitOnTabSwitch={setQuizAutoSubmitOnTabSwitch}
          quizMaxViolations={quizMaxViolations}
          setQuizMaxViolations={setQuizMaxViolations}
          quizImportFileName={quizImportFileName}
          addQuizQuestion={addQuizQuestion}
          removeQuizQuestion={removeQuizQuestion}
          updateQuizQuestion={updateQuizQuestion}
          updateQuizChoice={updateQuizChoice}
          onImportFile={(event) => void handleImportQuestionFile('quiz', event)}
          onDownloadTemplate={downloadQuestionImportTemplate}
          onImageUpload={isEditMode ? handleImageUpload : undefined}
          quizQuestionsError={errors.quizQuestions}
          clearFieldError={clearFieldError}
        />
      )}

      {taskType === 'exam' && (
        <ExamForm
          examQuestions={examQuestions}
          examImportedQuestions={examImportedQuestions}
          examImportFileName={examImportFileName}
          examQuestionOrder={examQuestionOrder}
          setExamQuestionOrder={setExamQuestionOrder}
          examQuestionSelection={examQuestionSelection}
          setExamQuestionSelection={setExamQuestionSelection}
          examIntegrityProfile={examIntegrityProfile}
          setExamIntegrityProfile={setExamIntegrityProfile}
          examTimerEnabled={examTimerEnabled}
          setExamTimerEnabled={setExamTimerEnabled}
          examDurationMinutes={examDurationMinutes}
          setExamDurationMinutes={setExamDurationMinutes}
          examRequireAgreementBeforeStart={examRequireAgreementBeforeStart}
          setExamRequireAgreementBeforeStart={setExamRequireAgreementBeforeStart}
          examAutoSubmitOnFullscreenExit={examAutoSubmitOnFullscreenExit}
          setExamAutoSubmitOnFullscreenExit={setExamAutoSubmitOnFullscreenExit}
          examAutoSubmitOnTabSwitch={examAutoSubmitOnTabSwitch}
          setExamAutoSubmitOnTabSwitch={setExamAutoSubmitOnTabSwitch}
          examOneQuestionAtATime={examOneQuestionAtATime}
          setExamOneQuestionAtATime={setExamOneQuestionAtATime}
          examMaxViolations={examMaxViolations}
          setExamMaxViolations={setExamMaxViolations}
          addExamQuestion={addExamQuestion}
          removeExamQuestion={removeExamQuestion}
          updateExamQuestion={updateExamQuestion}
          updateExamChoice={updateExamChoice}
          onImportFile={(event) => void handleImportQuestionFile('exam', event)}
          onDownloadTemplate={downloadQuestionImportTemplate}
          onImageUpload={isEditMode ? handleImageUpload : undefined}
          clearFieldError={clearFieldError}
          examBuilderCandidateCount={examBuilderCandidateCount}
          examBuilderReadyCount={examBuilderReadyCount}
          examImportReadyCount={examImportReadyCount}
          examChapterPoolEnabled={examChapterPoolEnabled}
          setExamChapterPoolEnabled={setExamChapterPoolEnabled}
          examChapterPool={examChapterPool}
          setExamChapterPool={setExamChapterPool}
        />
      )}

      {taskType === 'recitation' && (
        <RecitationForm
          recitationMode={recitationMode}
          setRecitationMode={setRecitationMode}
          recitationCriteria={recitationCriteria}
          setRecitationCriteria={setRecitationCriteria}
          submissionsOpen={submissionsOpen}
          setSubmissionsOpen={setSubmissionsOpen}
        />
      )}

      {taskType === 'project' && (
        <ProjectForm
          projectGroupMode={projectGroupMode}
          setProjectGroupMode={setProjectGroupMode}
          projectGroupSize={projectGroupSize}
          setProjectGroupSize={setProjectGroupSize}
          projectAllowedFileTypes={projectAllowedFileTypes}
          toggleProjectFileType={toggleProjectFileType}
          submissionsOpen={submissionsOpen}
          setSubmissionsOpen={setSubmissionsOpen}
          autoCloseSubmissionsOnDueDate={autoCloseSubmissionsOnDueDate}
          setAutoCloseSubmissionsOnDueDate={setAutoCloseSubmissionsOnDueDate}
          customSubmissionCloseDate={customSubmissionCloseDate}
          setCustomSubmissionCloseDate={setCustomSubmissionCloseDate}
          projectFileTypesError={errors.projectFileTypes}
          customSubmissionCloseDateError={errors.customSubmissionCloseDate}
          clearFieldError={clearFieldError}
        />
      )}
    </div>
  );

  const topicsSectionContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Tag this task with topics (e.g. "Homework", "Group Work", "Algebra"). Students can filter the Classwork tab by topic to find related work.
      </p>
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {topics.map((topic) => (
            <span key={topic} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              {topic}
              <button type="button" onClick={() => removeTopic(topic)} className="ml-0.5 hover:text-destructive" aria-label={`Remove topic ${topic}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="e.g., Homework, Group Work, Algebra..."
          value={topicDraft}
          onChange={(e) => setTopicDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopic(); } }}
          maxLength={40}
          className="rounded-lg"
          disabled={topics.length >= 10}
        />
        <Button type="button" size="icon" className="rounded-lg shrink-0" onClick={addTopic} disabled={!topicDraft.trim() || topics.length >= 10} aria-label="Add topic">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">{topics.length}/10 topics · max 40 characters each</p>
    </div>
  );

  const attachmentsSectionContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {taskType === 'reading_material' ? 'Attach the reading file that students will open inside the app.' : 'Attach supporting files such as PDFs, documents, images, or presentations.'}
      </p>
      <div className="relative">
        <input type="file" multiple onChange={handleFileAttach} className="hidden" id="file-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.zip" disabled={isActionLocked} />
        <label htmlFor="file-input" className={cn('block p-6 border-2 border-dashed border-border rounded-lg bg-muted/30 transition-colors text-center', isActionLocked ? 'cursor-not-allowed opacity-70 pointer-events-none' : 'cursor-pointer hover:bg-muted/50')}>
          <div className="flex flex-col items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg w-fit"><Paperclip className="h-5 w-5 text-primary" /></div>
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, Images, or ZIP files</p>
          </div>
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-sm font-semibold">Attached Files</p>
          {files.map((file) => {
            const isFileUploading = taskType === 'reading_material' && isUploadingMaterial && uploadingMaterialId === file.id;
            const isFileUploaded = taskType === 'reading_material' && !isUploadingMaterial && completedMaterialId === file.id;
            return (
              <div key={file.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg group hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-primary/10 rounded flex-shrink-0"><FileText className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.size}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isFileUploading ? <Badge variant="secondary" className="rounded-full h-5 px-2 py-0 text-[10px]">Uploading {Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%</Badge> : null}
                  {isFileUploaded ? <Badge className="rounded-full h-5 px-2 py-0 text-[10px] bg-emerald-600 hover:bg-emerald-600">Upload complete</Badge> : null}
                  <button onClick={() => removeFile(file.id)} disabled={isActionLocked} className={cn('p-1 rounded transition-all', isActionLocked ? 'opacity-40 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100 hover:bg-destructive/10')}>
                    <X className="h-4 w-4 text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {taskType === 'reading_material' && !isUploadingMaterial && completedMaterialId ? (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Upload complete. File is ready to publish.</span>
        </div>
      ) : null}

      {taskType === 'reading_material' && isUploadingMaterial ? (
        <Card className="border border-primary/25 bg-primary/5 mt-4">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-foreground flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="truncate">Uploading {uploadingMaterialName || 'reading material'}...</span>
              </p>
              <span className="text-xs text-muted-foreground">{Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%</span>
            </div>
            <Progress value={Math.max(0, Math.min(100, Math.round(materialUploadProgress)))} className="h-2" />
            <p className="text-xs text-muted-foreground">Please keep this dialog open until the upload is complete.</p>
          </CardContent>
        </Card>
      ) : null}

      {files.length === 0 && (
        <Card className="border-0 bg-muted/30 mt-4">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">No files attached yet. Add files to provide students with resources.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const formSections = (
    <div className="space-y-8">
      <section className="space-y-5">
        {detailsSectionContent}
      </section>
      {(taskType === 'reading_material' || (taskType !== 'recitation' && taskType !== 'project')) && (
        <section className="space-y-4">
          <div className="border-t border-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Topics</h3>
            {topicsSectionContent}
          </div>
        </section>
      )}
      {(taskType === 'activity' || taskType === 'reading_material') && (
        <section className="space-y-4">
          <div className="border-t border-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">Reference Files</h3>
            {attachmentsSectionContent}
          </div>
        </section>
      )}
    </div>
  );

  if (isPage) {
    return (
      <div className="w-full min-h-[calc(100vh-14rem)] rounded-2xl border border-border bg-card p-4 md:p-6 lg:p-8">
        {isLoadingEdit && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading assessment data...
          </div>
        )}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">{isEditMode ? `Edit ${TASK_LABELS[taskType]}` : `Create ${TASK_LABELS[taskType]}`}</h2>
          <p className="text-sm text-muted-foreground mt-1">{TASK_PAGE_INTRO[taskType]}</p>
        </div>
        {formSections}
        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actionButtons}</div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{isEditMode ? `Edit ${TASK_LABELS[taskType]}` : 'Create Task'}</DialogTitle>
          <DialogDescription>{isEditMode ? `Update the details for this ${TASK_LABELS[taskType].toLowerCase()}.` : 'Create a reading material, activity, quiz, exam, recitation, or project for your class.'}</DialogDescription>
        </DialogHeader>
        {isLoadingEdit && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading assessment data...
          </div>
        )}
        {formSections}
        <DialogFooter className="mt-6">{actionButtons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
