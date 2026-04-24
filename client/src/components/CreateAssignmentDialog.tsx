import { useEffect, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  FileText,
  Activity,
  BookOpen,
  ClipboardCheck,
  Calendar as CalendarIcon,
  Paperclip,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { assignmentsService } from '@/services/assignments.service';
import { examsService, type CreateExamQuestionPayload } from '@/services/exams.service';
import { materialsService, type MaterialType } from '@/services/materials.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { strFromU8, unzipSync } from 'fflate';

interface CreateAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId?: string;
  onCreated?: () => void;
  initialTaskType?: TaskType;
  isPage?: boolean;
}

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  file: File;
}

interface Topic {
  id: string;
  name: string;
}

export type TaskType = 'reading_material' | 'activity' | 'quiz' | 'exam';
type ActivityMode = 'essay_writing' | 'group_activity' | 'assignment';
type QuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_in_blank' | 'essay';

interface QuizBuilderQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  answerKey: string;
  points?: number;
}

interface ImportedQuestionDraft {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices: string[];
  answerKey: string;
  points: number;
  explanation: string;
  chapterTag: string | null;
}

interface QuestionImportParseResult {
  questions: ImportedQuestionDraft[];
  skippedCount: number;
}

const TASK_LABELS: Record<TaskType, string> = {
  reading_material: 'Reading Material',
  activity: 'Activity',
  quiz: 'Quiz',
  exam: 'Exam',
};

const TASK_HELP_TEXT: Record<TaskType, string> = {
  reading_material: 'Upload PDF, DOCX, or PPT resources students can view in-app with per-student reading progress.',
  activity: 'Students submit files (PDF, DOCX, etc.) for teacher review and manual grading.',
  quiz: 'Build MCQ, True/False, or Short Answer questions. Students answer in-app and get instant auto-graded results.',
  exam: 'Proctored in-app exam with anti-cheat (fullscreen, tab-switch detection). Import questions or build inline.',
};

const ACTIVITY_FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'pptx', label: 'PPTX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'png', label: 'PNG/JPG' },
  { value: 'zip', label: 'ZIP' },
];

const ALLOWED_READING_MATERIAL_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/webm',
  'application/zip',
  'application/x-zip-compressed',
]);

const ALLOWED_READING_MATERIAL_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'mp4',
  'webm',
  'zip',
]);

const getFileExtension = (fileName: string): string => {
  const segment = fileName.split('.').pop();
  return (segment || '').trim().toLowerCase();
};

const inferMaterialTypeFromFile = (file: File): MaterialType | null => {
  const mimeType = (file.type || '').trim().toLowerCase();

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType === 'video/mp4' || mimeType === 'video/webm') {
    return 'video';
  }

  if (ALLOWED_READING_MATERIAL_MIME_TYPES.has(mimeType)) {
    return 'document';
  }

  const extension = getFileExtension(file.name);

  if (extension === 'pdf') {
    return 'pdf';
  }

  if (extension === 'mp4' || extension === 'webm') {
    return 'video';
  }

  if (ALLOWED_READING_MATERIAL_EXTENSIONS.has(extension)) {
    return 'document';
  }

  return null;
};

const QUIZ_QUESTION_TYPE_OPTIONS: Array<{ value: QuizQuestionType; label: string }> = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True or False' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'fill_in_blank', label: 'Fill in the Blank' },
];

const TASK_PAGE_INTRO: Record<TaskType, string> = {
  reading_material:
    'Publish class references to in-app storage and monitor who opened the material.',
  activity:
    'Create traditional work such as essays, group activities, or assignments with direct file submission.',
  quiz:
    'Build quiz questions, choose question types, and control random or sequential delivery.',
  exam:
    'Set up proctored exam behavior, chapter pools, and delivery controls.',
};

const QUESTION_IMPORT_RECOMMENDED_FILE_TYPE = 'DOCX or JSON';

const QUESTION_IMPORT_ACCEPT =
  '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.json,application/json';

const QUESTION_IMPORT_DOCX_GUIDE =
  'DOCX format guide: Use one question block per section with fields like Type:, Prompt:, Choices:, Answer:, Points:, Chapter:, Explanation:. Separate each question block with a blank line.';

const QUESTION_IMPORT_TEMPLATE = {
  questions: [
    {
      type: 'multiple_choice',
      prompt: 'What is 2 + 2?',
      choices: ['1', '2', '3', '4'],
      answer: '4',
      points: 1,
      chapter_tag: 'Arithmetic',
    },
    {
      type: 'true_false',
      prompt: 'The earth revolves around the sun.',
      answer: 'true',
      points: 1,
      chapter_tag: 'Science Basics',
    },
    {
      type: 'short_answer',
      prompt: 'Name the process plants use to make food.',
      answer: 'photosynthesis|photo synthesis',
      points: 2,
      explanation: 'Accept common spelling variations.',
      chapter_tag: 'Biology',
    },
    {
      type: 'fill_in_blank',
      prompt: 'The capital of the Philippines is _____.',
      answer: 'Manila',
      points: 1,
      chapter_tag: 'Geography',
    },
    {
      type: 'essay',
      prompt: 'Explain the importance of teamwork in group projects.',
      answer: 'Teacher-reviewed rubric response',
      points: 5,
      chapter_tag: 'Performance Task',
    },
  ],
};

const createQuizDraftQuestion = (
  type: QuizQuestionType = 'multiple_choice'
): QuizBuilderQuestion => ({
  id: Math.random().toString(36).slice(2, 11),
  type,
  prompt: '',
  choices: type === 'multiple_choice' ? ['', '', '', ''] : [],
  answerKey: type === 'true_false' ? 'true' : type === 'multiple_choice' ? 'A' : '',
});

const normalizeQuestionImportType = (value: unknown): QuizQuestionType => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  if (normalized === 'multiple_choice' || normalized === 'mcq') return 'multiple_choice';
  if (normalized === 'true_false' || normalized === 'truefalse') return 'true_false';
  if (normalized === 'short_answer' || normalized === 'shortanswer') return 'short_answer';
  if (normalized === 'fill_in_blank' || normalized === 'fillintheblank') return 'fill_in_blank';
  if (normalized === 'essay') return 'essay';

  return 'multiple_choice';
};

const toEndOfDayISOString = (value?: Date): string | null => {
  if (!value) return null;

  const endOfDay = new Date(value);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.toISOString();
};

const splitInlineChoices = (value: string): string[] => {
  const source = value.trim();
  if (!source) return [];

  if (source.includes('|')) {
    return source
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (source.includes(';')) {
    return source
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [source];
};

const extractDocxText = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(arrayBuffer));
  } catch {
    throw new Error('Unable to read DOCX file. Please ensure the file is a valid .docx document.');
  }

  const documentXml = archive['word/document.xml'];
  if (!documentXml) {
    throw new Error('Invalid DOCX format. Could not find document content.');
  }

  const xmlText = strFromU8(documentXml);
  const xmlDocument = new DOMParser().parseFromString(xmlText, 'application/xml');

  if (xmlDocument.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Unable to parse DOCX content.');
  }

  const paragraphs = Array.from(xmlDocument.getElementsByTagName('w:p'))
    .map((paragraphNode) => {
      const textParts = Array.from(paragraphNode.getElementsByTagName('w:t'))
        .map((textNode) => textNode.textContent ?? '');
      return textParts.join('').trim();
    })
    .filter(Boolean);

  const combinedText = paragraphs.join('\n').trim();
  if (!combinedText) {
    throw new Error('DOCX file is empty or has no readable question content.');
  }

  return combinedText;
};

const parseDocxQuestionCandidates = (rawText: string): Array<Record<string, unknown>> => {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim());

  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const pushBlock = () => {
    if (currentBlock.some((line) => line.length > 0)) {
      blocks.push(currentBlock);
    }
    currentBlock = [];
  };

  lines.forEach((line) => {
    if (!line || /^[-*_]{3,}$/.test(line)) {
      pushBlock();
      return;
    }

    const questionHeaderMatch = line.match(/^question\s+\d+\s*[:.)-]?\s*(.*)$/i);
    if (questionHeaderMatch) {
      pushBlock();
      const inlinePrompt = questionHeaderMatch[1]?.trim();
      if (inlinePrompt) {
        currentBlock.push(`Prompt: ${inlinePrompt}`);
      }
      return;
    }

    currentBlock.push(line);
  });

  pushBlock();

  return blocks
    .map((block) => {
      const row: Record<string, unknown> = {};
      const extractedChoices: string[] = [];
      let collectingChoices = false;

      block.forEach((line) => {
        const keyValueMatch = line.match(/^([A-Za-z][A-Za-z _-]{0,30})\s*:\s*(.*)$/);
        if (keyValueMatch) {
          const key = keyValueMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
          const value = keyValueMatch[2].trim();

          collectingChoices = false;

          if (key === 'type') {
            row.type = value;
            return;
          }

          if (key === 'prompt' || key === 'question' || key === 'q') {
            row.prompt = value;
            return;
          }

          if (key === 'choices' || key === 'options') {
            collectingChoices = true;
            extractedChoices.push(...splitInlineChoices(value));
            return;
          }

          if (key === 'answer' || key === 'answer_key' || key === 'a' || key === 'correct_answer') {
            row.answer = value;
            return;
          }

          if (key === 'accepted_answers') {
            row.accepted_answers = value
              .split('|')
              .map((item) => item.trim())
              .filter(Boolean);
            return;
          }

          if (key === 'points' || key === 'score') {
            row.points = Number(value);
            return;
          }

          if (key === 'chapter' || key === 'chapter_tag' || key === 'category' || key === 'tag') {
            row.chapter_tag = value;
            return;
          }

          if (key === 'explanation' || key === 'rationale') {
            row.explanation = value;
            return;
          }
        }

        if (collectingChoices) {
          if (/^[-*•]\s+/.test(line)) {
            extractedChoices.push(line.replace(/^[-*•]\s+/, '').trim());
            return;
          }

          if (/^\d+[.):-]\s+/.test(line)) {
            extractedChoices.push(line.replace(/^\d+[.):-]\s+/, '').trim());
            return;
          }

          if (/^[A-Za-z][.):-]\s+/.test(line)) {
            extractedChoices.push(line.replace(/^[A-Za-z][.):-]\s+/, '').trim());
            return;
          }

          collectingChoices = false;
        }

        if (!row.prompt) {
          row.prompt = line.replace(/^q(?:uestion)?\s*[:.-]\s*/i, '').trim();
          return;
        }

        row.prompt = `${String(row.prompt).trim()} ${line}`.trim();
      });

      if (extractedChoices.length > 0) {
        row.choices = extractedChoices;
      }

      return row;
    })
    .filter((row) => String(row.prompt || '').trim().length > 0);
};

const toImportedQuestionDraft = (candidate: unknown): ImportedQuestionDraft | null => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const row = candidate as Record<string, unknown>;
  const prompt = String(row.prompt || '').trim();

  if (!prompt) {
    return null;
  }

  const type = normalizeQuestionImportType(row.type);
  const rawChoices = Array.isArray(row.choices)
    ? row.choices.map((choice) => String(choice).trim()).filter(Boolean)
    : [];

  const choices =
    type === 'multiple_choice'
      ? rawChoices.length >= 2
        ? rawChoices
        : ['Option A', 'Option B']
      : type === 'true_false'
        ? ['True', 'False']
        : [];

  const rawAnswer = row.answer ?? row.answer_key ?? row.accepted_answers;
  const answerText = Array.isArray(rawAnswer)
    ? rawAnswer.map((value) => String(value).trim()).filter(Boolean).join('|')
    : String(rawAnswer ?? '').trim();

  const answerIndex = Number.isFinite(Number(row.answer_index)) ? Number(row.answer_index) : null;
  let answerKey = answerText;

  if (type === 'multiple_choice') {
    if (answerIndex !== null && answerIndex >= 0 && answerIndex < choices.length) {
      answerKey = choices[answerIndex];
    } else if (/^[a-d]$/i.test(answerText)) {
      const letterIndex = answerText.toUpperCase().charCodeAt(0) - 65;
      if (letterIndex >= 0 && letterIndex < choices.length) {
        answerKey = choices[letterIndex];
      }
    }
  }

  if (type === 'true_false') {
    const normalizedAnswer = answerText.toLowerCase();
    answerKey = normalizedAnswer === 'false' || normalizedAnswer === 'f' ? 'False' : 'True';
  }

  const parsedPoints = Number(row.points);
  const points = Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1;

  return {
    id: Math.random().toString(36).slice(2, 11),
    type,
    prompt,
    choices,
    answerKey,
    points,
    explanation: String(row.explanation || '').trim(),
    chapterTag: row.chapter_tag ? String(row.chapter_tag).trim() : null,
  };
};

export function CreateAssignmentDialog({
  open,
  onOpenChange,
  classId,
  onCreated,
  initialTaskType,
  isPage = false,
}: CreateAssignmentDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<TaskType>(initialTaskType ?? 'activity');
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
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
  const [examImportedQuestions, setExamImportedQuestions] = useState<ImportedQuestionDraft[]>([]);
  const [examImportFileName, setExamImportFileName] = useState<string | null>(null);
  const [examChapterPoolEnabled, setExamChapterPoolEnabled] = useState(false);
  const [examChapterTags, setExamChapterTags] = useState('');
  const [examQuestionsPerChapter, setExamQuestionsPerChapter] = useState('5');
  const [examTotalQuestions, setExamTotalQuestions] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [showTopicInput, setShowTopicInput] = useState(false);
  const [gradingPeriod, setGradingPeriod] = useState<'pre_mid' | 'midterm' | 'pre_final' | 'final' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [materialUploadProgress, setMaterialUploadProgress] = useState(0);
  const [uploadingMaterialName, setUploadingMaterialName] = useState<string | null>(null);
  const [uploadingMaterialId, setUploadingMaterialId] = useState<string | null>(null);
  const [completedMaterialId, setCompletedMaterialId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (initialTaskType) {
      setTaskType(initialTaskType);
    }
  }, [initialTaskType]);

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
      if (!prev[field]) {
        return prev;
      }

      const nextErrors = { ...prev };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (taskType !== 'reading_material' && !dueDate) {
      newErrors.dueDate = 'Due date is required for activity, quiz, and exam tasks';
    }

    if (taskType === 'reading_material' && files.length === 0) {
      newErrors.readingMaterialFile = 'Attach a compatible file to continue';
    }

    if (taskType !== 'reading_material') {
      const parsedPoints = Number(points);
      if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
        newErrors.points = 'Points must be a non-negative number';
      }
    }

    if (taskType === 'activity' && activityAllowedFileTypes.length === 0) {
      newErrors.activityFileTypes = 'Select at least one allowed file type for activity submissions';
    }

    if (
      taskType !== 'reading_material' &&
      submissionsOpen &&
      !autoCloseSubmissionsOnDueDate &&
      !customSubmissionCloseDate
    ) {
      newErrors.customSubmissionCloseDate = 'Pick a custom close date or enable automatic closing on due date';
    }

    if (taskType === 'quiz') {
      const hasAnyQuestion = quizQuestions.some((question) => question.prompt.trim().length > 0);
      if (!hasAnyQuestion) {
        newErrors.quizQuestions = 'Add at least one quiz question prompt';
      }
    }

    if (taskType === 'exam' && examChapterPoolEnabled) {
      const parsedTags = examChapterTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (parsedTags.length === 0) {
        newErrors.examChapterTags = 'Add at least one chapter tag when chapter pools are enabled';
      }

      const perChapterCount = Number(examQuestionsPerChapter);
      if (!Number.isFinite(perChapterCount) || perChapterCount <= 0) {
        newErrors.examQuestionsPerChapter = 'Questions per chapter must be a positive number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting || isUploadingMaterial) {
      e.target.value = '';
      return;
    }

    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const acceptedFiles: AttachedFile[] = [];
    const rejectedFileNames: string[] = [];

    Array.from(selectedFiles).forEach((file) => {
      if (!inferMaterialTypeFromFile(file)) {
        rejectedFileNames.push(file.name);
        return;
      }

      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      acceptedFiles.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: `${fileSizeMB} MB`,
        type: file.type,
        file,
      });
    });

    if (rejectedFileNames.length > 0) {
      const rejectedSummary = rejectedFileNames.slice(0, 3).join(', ');
      const suffix = rejectedFileNames.length > 3 ? ` +${rejectedFileNames.length - 3} more` : '';
      toast({
        title: 'Unsupported file type rejected',
        description: `${rejectedSummary}${suffix}. Allowed: PDF, Office files, images, MP4/WEBM, ZIP.`,
        variant: 'destructive',
      });
    }

    if (acceptedFiles.length === 0) {
      e.target.value = '';
      return;
    }

    setCompletedMaterialId(null);
    setUploadingMaterialId(null);

    if (taskType === 'reading_material' && readingSingleResourceMode) {
      setFiles(acceptedFiles.slice(-1));
      clearFieldError('readingMaterialFile');
      if (acceptedFiles.length > 1 || files.length > 0) {
        toast({
          title: 'Single file mode enabled',
          description: 'Only the latest selected file will be attached for this reading material.',
        });
      }
    } else {
      setFiles((prev) => [...prev, ...acceptedFiles]);
      clearFieldError('readingMaterialFile');
    }

    // Reset input
    e.target.value = '';
  };

  const removeFile = (fileId: string) => {
    if (isSubmitting || isUploadingMaterial) {
      return;
    }

    if (completedMaterialId === fileId) {
      setCompletedMaterialId(null);
    }

    if (uploadingMaterialId === fileId) {
      setUploadingMaterialId(null);
    }

    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const addTopic = () => {
    if (!newTopic.trim()) return;

    const topic: Topic = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTopic.trim(),
    };

    setTopics((prev) => [...prev, topic]);
    setNewTopic('');
    setShowTopicInput(false);
  };

  const removeTopic = (topicId: string) => {
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
  };

  const toggleActivityFileType = (fileType: string, checked: boolean) => {
    setActivityAllowedFileTypes((prev) => {
      if (checked) {
        if (prev.includes(fileType)) return prev;
        return [...prev, fileType];
      }

      return prev.filter((value) => value !== fileType);
    });
    clearFieldError('activityFileTypes');
  };

  const addQuizQuestion = () => {
    setQuizQuestions((prev) => [...prev, createQuizDraftQuestion()]);
    clearFieldError('quizQuestions');
  };

  const removeQuizQuestion = (questionId: string) => {
    setQuizQuestions((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((question) => question.id !== questionId);
    });
  };

  const updateQuizQuestion = (questionId: string, update: Partial<QuizBuilderQuestion>) => {
    setQuizQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        const nextType = update.type ?? question.type;
        const typeChanged = update.type !== undefined && update.type !== question.type;
        const nextChoices =
          nextType === 'multiple_choice'
            ? question.choices.length >= 4
              ? question.choices
              : ['', '', '', '']
            : [];
        const nextAnswerKey = typeChanged
          ? nextType === 'true_false' ? 'true' : nextType === 'multiple_choice' ? 'A' : ''
          : (update.answerKey ?? question.answerKey);

        return {
          ...question,
          ...update,
          type: nextType,
          choices: update.choices ?? nextChoices,
          answerKey: nextAnswerKey,
        };
      })
    );
    clearFieldError('quizQuestions');
  };

  const updateQuizChoice = (questionId: string, choiceIndex: number, value: string) => {
    setQuizQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId || question.type !== 'multiple_choice') {
          return question;
        }

        const nextChoices = [...question.choices];
        nextChoices[choiceIndex] = value;
        return {
          ...question,
          choices: nextChoices,
        };
      })
    );
  };

  const hasQuestionDraftContent = (question: QuizBuilderQuestion): boolean => {
    if (question.prompt.trim().length > 0) return true;
    if (question.answerKey.trim().length > 0) return true;
    if (question.type === 'multiple_choice') {
      return question.choices.some((choice) => choice.trim().length > 0);
    }

    return false;
  };

  const addExamQuestion = () => {
    setExamQuestions((prev) => [...prev, createQuizDraftQuestion()]);
  };

  const removeExamQuestion = (questionId: string) => {
    setExamQuestions((prev) => {
      if (prev.length <= 1) {
        return prev;
      }

      return prev.filter((question) => question.id !== questionId);
    });
  };

  const updateExamQuestion = (questionId: string, update: Partial<QuizBuilderQuestion>) => {
    setExamQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        const nextType = update.type ?? question.type;
        const nextChoices =
          nextType === 'multiple_choice'
            ? question.choices.length >= 4
              ? question.choices
              : ['', '', '', '']
            : [];

        return {
          ...question,
          ...update,
          type: nextType,
          choices: update.choices ?? nextChoices,
        };
      })
    );
  };

  const updateExamChoice = (questionId: string, choiceIndex: number, value: string) => {
    setExamQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId || question.type !== 'multiple_choice') {
          return question;
        }

        const nextChoices = [...question.choices];
        nextChoices[choiceIndex] = value;
        return {
          ...question,
          choices: nextChoices,
        };
      })
    );
  };

  const parseQuestionImportFile = async (file: File): Promise<QuestionImportParseResult> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    let candidates: unknown[] | null = null;

    if (extension === 'json') {
      const rawText = await file.text();
      let parsedContent: unknown;

      try {
        parsedContent = JSON.parse(rawText);
      } catch {
        throw new Error('Invalid JSON file. Please validate the file format and try again.');
      }

      candidates = Array.isArray(parsedContent)
        ? parsedContent
        : Array.isArray((parsedContent as { questions?: unknown[] })?.questions)
          ? ((parsedContent as { questions: unknown[] }).questions)
          : null;

      if (!candidates) {
        throw new Error('Expected a questions array in the JSON file.');
      }
    } else if (extension === 'docx') {
      const rawDocxText = await extractDocxText(file);
      candidates = parseDocxQuestionCandidates(rawDocxText);

      if (!candidates || candidates.length === 0) {
        throw new Error('No question blocks were detected in the DOCX file.');
      }
    } else {
      throw new Error('Please upload a DOCX or JSON file.');
    }

    const importedQuestions: ImportedQuestionDraft[] = [];
    let skippedCount = 0;

    candidates.forEach((candidate) => {
      const mappedQuestion = toImportedQuestionDraft(candidate);
      if (!mappedQuestion) {
        skippedCount += 1;
        return;
      }

      importedQuestions.push(mappedQuestion);
    });

    if (importedQuestions.length === 0) {
      throw new Error('No valid questions were found in the import file.');
    }

    return {
      questions: importedQuestions,
      skippedCount,
    };
  };

  const handleDownloadQuestionImportTemplate = () => {
    const payload = JSON.stringify(QUESTION_IMPORT_TEMPLATE, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'question-import-template.json';
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const handleImportQuestionFile = async (
    targetTask: 'quiz' | 'exam',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseQuestionImportFile(file);

      if (targetTask === 'quiz') {
        setQuizQuestions(
          result.questions.map((question) => ({
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            choices: question.choices,
            answerKey: question.answerKey,
          }))
        );
        setQuizImportFileName(file.name);
        clearFieldError('quizQuestions');
      } else {
        setExamImportedQuestions(result.questions);
        setExamImportFileName(file.name);

        const importChapterTags = Array.from(
          new Set(
            result.questions
              .map((question) => question.chapterTag)
              .filter((tag): tag is string => Boolean(tag && tag.trim()))
          )
        );

        if (importChapterTags.length > 0 && !examChapterTags.trim()) {
          setExamChapterTags(importChapterTags.join(', '));
        }
      }

      toast({
        title: 'Questions imported',
        description:
          result.skippedCount > 0
            ? `${result.questions.length} questions imported. ${result.skippedCount} rows were skipped.`
            : `${result.questions.length} questions imported from ${file.name}.`,
      });
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error?.message || 'Unable to import questions from the selected file.',
        variant: 'destructive',
      });
    } finally {
      event.target.value = '';
    }
  };

  const resolveCorrectChoiceIndex = (choices: string[], answerKey: string): number => {
    const normalized = answerKey.trim().toLowerCase();
    if (!normalized) return 0;

    const directIndex = choices.findIndex((choice) => choice.trim().toLowerCase() === normalized);
    if (directIndex >= 0) return directIndex;

    if (/^[a-z]$/i.test(normalized)) {
      const letterIndex = normalized.toUpperCase().charCodeAt(0) - 65;
      if (letterIndex >= 0 && letterIndex < choices.length) {
        return letterIndex;
      }
    }

    return 0;
  };

  const toExamQuestionPayload = (
    question: {
      type: QuizQuestionType;
      prompt: string;
      choices: string[];
      answerKey: string;
      points?: number;
      explanation?: string;
      chapterTag?: string | null;
    },
    orderIndex: number
  ): CreateExamQuestionPayload | null => {
    const prompt = question.prompt.trim();
    if (!prompt) {
      return null;
    }

    const basePayload = {
      prompt,
      points: question.points,
      explanation: question.explanation || undefined,
      order_index: orderIndex,
      chapter_tag: question.chapterTag,
    };

    if (question.type === 'multiple_choice') {
      const choices = question.choices.map((choice) => choice.trim()).filter(Boolean);
      if (choices.length < 2) {
        return null;
      }

      return {
        ...basePayload,
        item_type: 'multiple_choice',
        choices,
        correct_choice_index: resolveCorrectChoiceIndex(choices, question.answerKey),
      };
    }

    if (question.type === 'true_false') {
      const normalizedAnswer = question.answerKey.trim().toLowerCase();
      const correctChoiceIndex = normalizedAnswer === 'false' || normalizedAnswer === 'f' ? 1 : 0;

      return {
        ...basePayload,
        item_type: 'true_false',
        choices: ['True', 'False'],
        correct_choice_index: correctChoiceIndex,
      };
    }

    const acceptedAnswers = question.answerKey
      .split('|')
      .map((answer) => answer.trim())
      .filter(Boolean);

    if (acceptedAnswers.length === 0) {
      return null;
    }

    return {
      ...basePayload,
      item_type: 'short_answer',
      answer_payload: {
        accepted_answers: acceptedAnswers,
        case_sensitive: false,
      },
    };
  };

  const toExamImportPayload = (
    question: ImportedQuestionDraft,
    orderIndex: number
  ): CreateExamQuestionPayload | null => {
    return toExamQuestionPayload(question, orderIndex);
  };

  const toExamBuilderPayload = (
    question: QuizBuilderQuestion,
    orderIndex: number
  ): CreateExamQuestionPayload | null => {
    return toExamQuestionPayload(
      {
        ...question,
        points: question.points && question.points > 0 ? question.points : 1,
      },
      orderIndex
    );
  };

  const buildActivityInstructions = () => {
    const modeLabel =
      activityMode === 'essay_writing'
        ? 'Essay Writing'
        : activityMode === 'group_activity'
          ? 'Group Activity'
          : 'Assignment';

    const closePolicy = autoCloseSubmissionsOnDueDate
      ? 'Auto-close at due date'
      : customSubmissionCloseDate
        ? `Custom close: ${customSubmissionCloseDate.toISOString()}`
        : 'Manual close by teacher';

    return [
      'Activity Configuration',
      `Mode: ${modeLabel}`,
      `Allowed file types: ${activityAllowedFileTypes.join(', ')}`,
      'Storage: Institutional Google Drive (teacher-visible student-owned files)',
      `Submission state: ${submissionsOpen ? 'Open' : 'Closed'}`,
      `Submission close policy: ${closePolicy}`,
    ].join('\n');
  };

  const buildQuizInstructions = () => {
    const questionBlueprint = quizQuestions
      .filter((question) => question.prompt.trim().length > 0)
      .map((question) => ({
        type: question.type,
        prompt: question.prompt.trim(),
        choices:
          question.type === 'multiple_choice'
            ? question.choices.map((choice) => choice.trim()).filter(Boolean)
            : undefined,
        answer_key: question.answerKey.trim() || undefined,
      }));

    return [
      'Quiz Builder Configuration',
      JSON.stringify(
        {
          order_mode: quizQuestionOrder,
          import_source: quizImportFileName || null,
          questions: questionBlueprint,
        },
        null,
        2
      ),
    ].join('\n');
  };

  const buildExamInstructions = () => {
    const examQuestionBlueprint = examQuestions
      .filter((question) => question.prompt.trim().length > 0)
      .map((question) => ({
        type: question.type,
        prompt: question.prompt.trim(),
        choices:
          question.type === 'multiple_choice'
            ? question.choices.map((choice) => choice.trim()).filter(Boolean)
            : undefined,
        answer_key: question.answerKey.trim() || undefined,
      }));

    return [
      'Exam Builder Configuration',
      JSON.stringify(
        {
          order_mode: examQuestionOrder,
          selection_mode: examQuestionSelection,
          import_source: examImportFileName || null,
          builder_questions_count: examQuestionBlueprint.length,
          imported_questions_count: examImportedQuestions.length,
          questions: examQuestionBlueprint,
          policy: {
            require_agreement_before_start: examRequireAgreementBeforeStart,
            auto_submit_on_tab_switch: examAutoSubmitOnTabSwitch,
            auto_submit_on_fullscreen_exit: examAutoSubmitOnFullscreenExit,
            max_violations: Number(examMaxViolations) || 3,
          },
        },
        null,
        2
      ),
    ].join('\n');
  };

  const handleTaskTypeChange = (nextType: TaskType) => {
    setTaskType(nextType);
    if (nextType !== 'reading_material') {
      setUploadingMaterialId(null);
      setCompletedMaterialId(null);
    }
    clearFieldError('dueDate');
    clearFieldError('points');
    clearFieldError('activityFileTypes');
    clearFieldError('quizQuestions');
    clearFieldError('examChapterTags');
    clearFieldError('examQuestionsPerChapter');
  };

  const handleCreate = async () => {
    if (isSubmitting || isUploadingMaterial) {
      return;
    }

    if (!validateForm()) return;

    if (!classId) {
      toast({
        title: 'Missing class context',
        description: 'Open this dialog from a class page to create tasks.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      if (taskType === 'reading_material') {
        const attachedMaterial = files[0];
        const attachedMaterialFile = attachedMaterial?.file;

        if (!attachedMaterialFile) {
          setErrors((prev) => ({
            ...prev,
            readingMaterialFile: 'Attach a compatible file to continue',
          }));
          return;
        }

        const resolvedMaterialType = inferMaterialTypeFromFile(attachedMaterialFile);

        if (!resolvedMaterialType) {
          toast({
            title: 'Unsupported reading material file',
            description: 'Allowed: PDF, Office files, images, MP4/WEBM, ZIP.',
            variant: 'destructive',
          });
          return;
        }

        setIsUploadingMaterial(true);
        setMaterialUploadProgress(0);
        setUploadingMaterialName(attachedMaterialFile.name);
        setUploadingMaterialId(attachedMaterial?.id || null);
        setCompletedMaterialId(null);

        await materialsService.create(classId, {
          title: title.trim(),
          type: resolvedMaterialType,
          file: attachedMaterialFile,
        }, {
          onUploadProgress: (progressEvent) => {
            const totalBytes = progressEvent.total || attachedMaterialFile.size;
            if (!totalBytes || totalBytes <= 0) {
              return;
            }

            const percent = Math.round((progressEvent.loaded / totalBytes) * 100);
            setMaterialUploadProgress(Math.min(100, Math.max(0, percent)));
          },
        });

        setMaterialUploadProgress(100);
        setCompletedMaterialId(attachedMaterial?.id || null);
        setUploadingMaterialId(null);
      } else {
        const assignmentType =
          taskType === 'quiz'
            ? 'quiz'
            : taskType === 'exam'
              ? 'exam'
              : 'activity';

        const chapterTags = examChapterTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        const perChapterCount = Number(examQuestionsPerChapter);
        const totalQuestionsCount = Number(examTotalQuestions);
        const chapterPoolRules = chapterTags.map((tag) => ({
          tag,
          ...(Number.isFinite(perChapterCount) && perChapterCount > 0
            ? { take: Math.floor(perChapterCount) }
            : {}),
        }));
        const chapterPoolEnabled = taskType === 'exam' && examChapterPoolEnabled && chapterPoolRules.length > 0;
        const parsedExamMaxViolations = Number(examMaxViolations);
        const effectiveExamMaxViolations =
          Number.isFinite(parsedExamMaxViolations) && parsedExamMaxViolations > 0
            ? Math.floor(parsedExamMaxViolations)
            : examIntegrityProfile === 'strict'
              ? 3
              : 5;
        const strictProctoring = examIntegrityProfile === 'strict';
        const submissionCloseAt = autoCloseSubmissionsOnDueDate
          ? toEndOfDayISOString(dueDate)
          : customSubmissionCloseDate
            ? toEndOfDayISOString(customSubmissionCloseDate)
            : null;
        const submissionOpenAt = submissionsOpen ? new Date().toISOString() : null;
        const assignmentInstructions =
          taskType === 'activity'
            ? buildActivityInstructions()
            : taskType === 'quiz'
              ? buildQuizInstructions()
              : taskType === 'exam'
                ? buildExamInstructions()
                : undefined;

        const createAssignmentResponse = await assignmentsService.createAssignment(classId, {
          title: title.trim(),
          description: description.trim() || undefined,
          assignment_type: assignmentType,
          grading_period: gradingPeriod || null,
          due_date: toEndOfDayISOString(dueDate) || new Date().toISOString(),
          max_points: (taskType === 'quiz')
            ? Math.max(1, quizQuestions.reduce((s, q) => s + (q.points ?? 1), 0))
            : (taskType === 'exam')
              ? Math.max(1, examQuestions.reduce((s, q) => s + (q.points ?? 1), 0) + examImportedQuestions.reduce((s, q) => s + (q.points ?? 1), 0))
              : (Number(points) || 100),
          submissions_open: submissionsOpen,
          submission_open_at: submissionOpenAt,
          submission_close_at: submissionCloseAt,
          instructions: assignmentInstructions,
          question_order_mode:
            taskType === 'quiz'
              ? quizQuestionOrder
              : taskType === 'exam'
                ? examQuestionOrder
                : undefined,
          exam_question_selection_mode:
            taskType === 'exam' ? examQuestionSelection : undefined,
          exam_chapter_pool:
            taskType === 'exam'
              ? {
                  enabled: chapterPoolEnabled,
                  chapters: chapterPoolEnabled ? chapterPoolRules : [],
                  ...(Number.isFinite(totalQuestionsCount) && totalQuestionsCount > 0
                    ? { total_questions: Math.floor(totalQuestionsCount) }
                    : {}),
                }
              : undefined,
          is_proctored: taskType === 'exam' ? true : undefined,
          proctoring_policy:
            taskType === 'exam'
              ? {
                  max_violations: effectiveExamMaxViolations,
                  require_agreement_before_start: examRequireAgreementBeforeStart,
                  auto_submit_on_tab_switch: examAutoSubmitOnTabSwitch,
                  auto_submit_on_fullscreen_exit: examAutoSubmitOnFullscreenExit,
                  // Keep legacy field for backward compatibility with older exam services.
                  terminate_on_fullscreen_exit: examAutoSubmitOnFullscreenExit,
                  block_clipboard: strictProctoring,
                  block_context_menu: strictProctoring,
                  block_print_shortcut: strictProctoring,
                  one_question_at_a_time: examOneQuestionAtATime,
                }
              : taskType === 'quiz'
              ? { one_question_at_a_time: quizOneQuestionAtATime }
              : undefined,
        });

        const createdAssignmentId = String(
          (createAssignmentResponse as { data?: { id?: string }; id?: string })?.data?.id
            || (createAssignmentResponse as { data?: { id?: string }; id?: string })?.id
            || ''
        );

        if ((taskType === 'exam' || taskType === 'quiz') && createdAssignmentId) {
          const sourceBuilderQuestions = taskType === 'quiz' ? quizQuestions : examQuestions;
          const candidateBuilderQuestions = sourceBuilderQuestions.filter(hasQuestionDraftContent);
          const builderPayloads = candidateBuilderQuestions
            .map((question, index) => toExamBuilderPayload(question, index))
            .filter((payload): payload is CreateExamQuestionPayload => Boolean(payload));

          const importedPayloads = taskType === 'exam'
            ? examImportedQuestions
                .map((question, index) => toExamImportPayload(question, builderPayloads.length + index))
                .filter((payload): payload is CreateExamQuestionPayload => Boolean(payload))
            : [];

          const mappedPayloads = [...builderPayloads, ...importedPayloads];

          if (mappedPayloads.length > 0) {
            await Promise.all(
              mappedPayloads.map((payload) => examsService.createExamQuestion(createdAssignmentId, payload))
            );
          }

          const sourceQuestionCount = candidateBuilderQuestions.length + (taskType === 'exam' ? examImportedQuestions.length : 0);
          const skippedOnSave = sourceQuestionCount - mappedPayloads.length;

          if (skippedOnSave > 0) {
            toast({
              title: `${TASK_LABELS[taskType]} questions partially applied`,
              description: `${mappedPayloads.length} questions saved. ${skippedOnSave} skipped due to missing prompt, answer key, or choices.`,
            });
          }
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignments', classId] }),
        queryClient.invalidateQueries({ queryKey: ['materials', classId] }),
      ]);

      toast({
        title: 'Created successfully',
        description:
          taskType === 'reading_material'
            ? 'Reading material created.'
            : `${TASK_LABELS[taskType]} task created.`,
      });

      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      const metadataFields = error?.response?.data?.error?.metadata?.fields;
      const firstFieldEntry =
        metadataFields && typeof metadataFields === 'object'
          ? Object.entries(metadataFields).find(([, value]) => Array.isArray(value) && value.length > 0)
          : undefined;
      const firstFieldMessage = firstFieldEntry
        ? `${firstFieldEntry[0]}: ${String(firstFieldEntry[1][0] || '').trim()}`
        : null;
      const message =
        firstFieldMessage ||
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to create task';
      toast({
        title: 'Creation failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setIsUploadingMaterial(false);
      setMaterialUploadProgress(0);
      setUploadingMaterialName(null);
      setUploadingMaterialId(null);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTaskType(initialTaskType ?? 'activity');
    setDueDate(undefined);
    setPoints('100');
    setReadingProgressTracking(true);
    setReadingSingleResourceMode(true);
    setActivityMode('assignment');
    setActivityAllowedFileTypes(['pdf', 'docx', 'pptx']);
    setSubmissionsOpen(true);
    setAutoCloseSubmissionsOnDueDate(true);
    setCustomSubmissionCloseDate(undefined);
    setQuizQuestionOrder('sequence');
    setQuizQuestions([createQuizDraftQuestion()]);
    setQuizImportFileName(null);
    setExamQuestionOrder('random');
    setExamQuestionSelection('random');
    setExamQuestions([createQuizDraftQuestion()]);
    setExamIntegrityProfile('strict');
    setExamRequireAgreementBeforeStart(true);
    setExamAutoSubmitOnTabSwitch(false);
    setExamAutoSubmitOnFullscreenExit(true);
    setExamMaxViolations('3');
    setExamImportedQuestions([]);
    setExamImportFileName(null);
    setExamChapterPoolEnabled(false);
    setExamChapterTags('');
    setExamQuestionsPerChapter('5');
    setExamTotalQuestions('');
    setGradingPeriod('');
    setFiles([]);
    setTopics([]);
    setNewTopic('');
    setShowTopicInput(false);
    setIsSubmitting(false);
    setIsUploadingMaterial(false);
    setMaterialUploadProgress(0);
    setUploadingMaterialName(null);
    setUploadingMaterialId(null);
    setCompletedMaterialId(null);
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && (isSubmitting || isUploadingMaterial)) {
      return;
    }

    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const taskOptions = [
    {
      id: 'reading_material' as const,
      label: 'Reading Material',
      description: 'Reference content and links',
      icon: BookOpen,
    },
    {
      id: 'activity' as const,
      label: 'Activity',
      description: 'Submit files · Graded by teacher',
      icon: Activity,
    },
    {
      id: 'quiz' as const,
      label: 'Quiz',
      description: 'In-app · Auto-graded · Instant results',
      icon: FileText,
    },
    {
      id: 'exam' as const,
      label: 'Exam',
      description: 'Proctored assessment flow',
      icon: ClipboardCheck,
    },
  ];

  const createTaskButtonLabel =
    isUploadingMaterial
      ? `Uploading ${Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%`
      : isSubmitting
        ? 'Creating...'
        : taskType === 'reading_material'
          ? 'Create Reading Material'
          : taskType === 'activity'
            ? 'Create Activity Task'
            : taskType === 'quiz'
              ? 'Create Quiz Task'
              : 'Create Exam Task';

  const isActionLocked = isSubmitting || isUploadingMaterial;

  const actionButtons = (
    <>
      <Button
        variant="outline"
        className="rounded-lg"
        onClick={() => handleOpenChange(false)}
        disabled={isActionLocked}
      >
        Cancel
      </Button>
      <Button className="rounded-lg gap-2" onClick={handleCreate} disabled={isActionLocked}>
        {isActionLocked ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {createTaskButtonLabel}
      </Button>
    </>
  );

  const selectedTaskOption = taskOptions.find((option) => option.id === taskType);
  const SelectedTaskIcon = selectedTaskOption?.icon ?? FileText;
  const examBuilderCandidateCount = examQuestions.filter(hasQuestionDraftContent).length;
  const examBuilderReadyCount = examQuestions.reduce((count, question, index) => {
    if (!hasQuestionDraftContent(question)) {
      return count;
    }

    return count + (toExamBuilderPayload(question, index) ? 1 : 0);
  }, 0);
  const examImportReadyCount = examImportedQuestions.reduce((count, question, index) => {
    return count + (toExamImportPayload(question, index) ? 1 : 0);
  }, 0);

  const detailsSectionContent = (
    <div className="space-y-5">
      {/* Task Type Selector */}
      {isTaskTypeLocked ? (
        <Card className="border border-primary/25 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <div className="rounded-lg bg-primary/15 p-2 text-primary">
              <SelectedTaskIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Task type locked for this page</p>
              <p className="text-xs text-muted-foreground mt-1">
                You selected {TASK_LABELS[taskType]} from the classwork menu. Fill out this page to publish it.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          <label className="text-sm font-semibold mb-3 block">
            Task Type
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {taskOptions.map((option) => {
              const Icon = option.icon;
              const selected = taskType === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleTaskTypeChange(option.id)}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer text-left',
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 bg-card'
                  )}
                >
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      selected ? 'bg-primary/20' : 'bg-muted'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        selected ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
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
          <Badge variant="secondary" className="rounded-full w-fit">
            Task-specific workspace
          </Badge>
          <p className="text-xs text-muted-foreground sm:ml-2">{TASK_HELP_TEXT[taskType]}</p>
        </CardContent>
      </Card>

      {/* Title */}
      <div>
        <label className="text-sm font-semibold">
          Title <span className="text-destructive">*</span>
        </label>
        <Input
          placeholder={
            taskType === 'reading_material'
              ? 'e.g., Chapter 4 Reading Pack'
              : taskType === 'activity'
                ? 'e.g., Lab Activity 2'
                : taskType === 'quiz'
                  ? 'e.g., Chapter 3 Quiz'
                  : 'e.g., Midterm Proctored Exam'
          }
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            clearFieldError('title');
          }}
          className={cn(
            'mt-2 rounded-lg',
            errors.title && 'border-destructive'
          )}
        />
        {errors.title && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errors.title}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-semibold">Description</label>
        <Textarea
          placeholder={
            taskType === 'reading_material'
              ? 'Optional summary, chapter notes, or reading guidance...'
              : 'Provide instructions, context, or details about the task...'
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-2 rounded-lg resize-none min-h-24"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {description.length}/500 characters
        </p>
      </div>

      {taskType === 'reading_material' && (
        <Card className="border border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-4 space-y-4">
            <div className="rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
              <p className="text-sm font-medium">File type is auto-detected from your upload</p>
              <p className="text-xs text-muted-foreground">Unsupported files are rejected automatically.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Track per-student reading progress</p>
                  <p className="text-xs text-muted-foreground">Monitor who opened the material and completion progress.</p>
                </div>
                <Switch
                  checked={readingProgressTracking}
                  onCheckedChange={setReadingProgressTracking}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-background px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Single resource type per material</p>
                  <p className="text-xs text-muted-foreground">Keep content format consistent and straightforward for students.</p>
                </div>
                <Switch
                  checked={readingSingleResourceMode}
                  onCheckedChange={setReadingSingleResourceMode}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Source storage: In-app secured storage
              </Badge>
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Progress tracking: {readingProgressTracking ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>

            {errors.readingMaterialFile && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.readingMaterialFile}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {taskType !== 'reading_material' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
          {/* Due Date */}
          <div>
            <label className="text-sm font-semibold">
              Due Date <span className="text-destructive">*</span>
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full mt-2 rounded-lg justify-start text-left font-normal',
                    !dueDate && 'text-muted-foreground',
                    errors.dueDate && 'border-destructive'
                  )}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dueDate ? formatDate(dueDate) : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(date) => {
                    setDueDate(date);
                    clearFieldError('dueDate');
                  }}
                  disabled={(date) =>
                    date < new Date(new Date().setHours(0, 0, 0, 0))
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {errors.dueDate && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.dueDate}
              </p>
            )}
          </div>

          {/* Grading Period */}
          <div>
            <label className="text-sm font-semibold">Grading Period</label>
            <Select
              value={gradingPeriod}
              onValueChange={(v) => setGradingPeriod(v as typeof gradingPeriod)}
            >
              <SelectTrigger className="mt-2 rounded-lg bg-background">
                <SelectValue placeholder="Select period (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— None —</SelectItem>
                <SelectItem value="pre_mid">Pre-Mid (25%)</SelectItem>
                <SelectItem value="midterm">Midterm (25%)</SelectItem>
                <SelectItem value="pre_final">Pre-Final (25%)</SelectItem>
                <SelectItem value="final">Final (25%)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Used for Mabini Colleges registrar grade export
            </p>
          </div>

          {/* Points */}
          <div>
            <label className="text-sm font-semibold">Points</label>
            {(taskType === 'quiz' || taskType === 'exam') ? (
              <div className="mt-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Auto-sum from question points</span>
                <span className="font-semibold tabular-nums">
                  {taskType === 'quiz'
                    ? quizQuestions.reduce((s, q) => s + (q.points ?? 1), 0)
                    : examQuestions.reduce((s, q) => s + (q.points ?? 1), 0) + examImportedQuestions.reduce((s, q) => s + (q.points ?? 1), 0)}
                </span>
              </div>
            ) : (
              <>
                <Input
                  type="number"
                  min="0"
                  value={points}
                  onChange={(e) => {
                    setPoints(e.target.value);
                    clearFieldError('points');
                  }}
                  className={cn(
                    'mt-2 rounded-lg',
                    errors.points && 'border-destructive'
                  )}
                />
                {errors.points && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.points}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {taskType === 'activity' && (
        <Card className="border border-sky-200 bg-sky-50/60">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold">Activity Format</label>
                <Select
                  value={activityMode}
                  onValueChange={(value) => setActivityMode(value as ActivityMode)}
                >
                  <SelectTrigger className="mt-2 rounded-lg bg-background">
                    <SelectValue placeholder="Choose format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essay_writing">Essay Writing</SelectItem>
                    <SelectItem value="group_activity">Group Activity</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold">Allowed Submission File Types</label>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-sky-200/70 bg-background p-3">
                  {ACTIVITY_FILE_TYPE_OPTIONS.map((option) => {
                    const checked = activityAllowedFileTypes.includes(option.value);
                    return (
                      <label key={option.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleActivityFileType(option.value, Boolean(value))}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                {errors.activityFileTypes && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.activityFileTypes}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-sky-200/70 bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Allow student submissions</p>
                  <p className="text-xs text-muted-foreground">Teachers can manually stop submissions anytime.</p>
                </div>
                <Switch
                  checked={submissionsOpen}
                  onCheckedChange={setSubmissionsOpen}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Automatically stop on due date</p>
                  <p className="text-xs text-muted-foreground">When enabled, submission close time follows the due date.</p>
                </div>
                <Switch
                  checked={autoCloseSubmissionsOnDueDate}
                  onCheckedChange={setAutoCloseSubmissionsOnDueDate}
                  disabled={!submissionsOpen}
                />
              </div>

              {submissionsOpen && !autoCloseSubmissionsOnDueDate && (
                <div>
                  <label className="text-sm font-semibold">Custom Submission Close Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full mt-2 rounded-lg justify-start text-left font-normal',
                          !customSubmissionCloseDate && 'text-muted-foreground',
                          errors.customSubmissionCloseDate && 'border-destructive'
                        )}
                      >
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {customSubmissionCloseDate ? formatDate(customSubmissionCloseDate) : 'Pick custom close date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customSubmissionCloseDate}
                        onSelect={(date) => {
                          setCustomSubmissionCloseDate(date);
                          clearFieldError('customSubmissionCloseDate');
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.customSubmissionCloseDate && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.customSubmissionCloseDate}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Storage: Institutional Google Drive
              </Badge>
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Graded manually by teacher
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {taskType === 'quiz' && (
        <Card className="border border-violet-200 bg-violet-50/60">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-sm font-semibold">Question Order Mode</label>
              <Select
                value={quizQuestionOrder}
                onValueChange={(value) => setQuizQuestionOrder(value as 'sequence' | 'random')}
              >
                <SelectTrigger className="mt-2 rounded-lg">
                  <SelectValue placeholder="Select order mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequence">Sequential</SelectItem>
                  <SelectItem value="random">Randomized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-violet-200/70 bg-background p-3">
              <div>
                <p className="text-sm font-medium">Show One Question at a Time</p>
                <p className="text-xs text-muted-foreground">Students see questions one by one, navigating with Previous / Next.</p>
              </div>
              <Switch
                checked={quizOneQuestionAtATime}
                onCheckedChange={setQuizOneQuestionAtATime}
              />
            </div>

            <div className="rounded-lg border border-violet-200/70 bg-background p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Import Questions</p>
                  <p className="text-xs text-muted-foreground">
                    Recommended file type: {QUESTION_IMPORT_RECOMMENDED_FILE_TYPE}. Importing replaces the current quiz draft questions.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {QUESTION_IMPORT_DOCX_GUIDE}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    id="quiz-question-import-input"
                    type="file"
                    accept={QUESTION_IMPORT_ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                      void handleImportQuestionFile('quiz', event);
                    }}
                  />
                  <Button type="button" variant="outline" className="rounded-lg" onClick={handleDownloadQuestionImportTemplate}>
                    Download JSON Template
                  </Button>
                  <Button type="button" className="rounded-lg" asChild>
                    <label htmlFor="quiz-question-import-input" className="cursor-pointer">Import File</label>
                  </Button>
                </div>
              </div>

              {quizImportFileName && (
                <p className="text-xs text-muted-foreground">
                  Imported source: {quizImportFileName}
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-violet-200/70 bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Question Builder</p>
                <Badge variant="secondary" className="rounded-full text-xs">
                  {quizQuestions.length} question{quizQuestions.length === 1 ? '' : 's'}
                </Badge>
              </div>

              {errors.quizQuestions && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.quizQuestions}
                </p>
              )}

              <div className="space-y-3">
                {quizQuestions.map((question, index) => (
                  <Card key={question.id} className="border border-border/70 bg-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Question {index + 1}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive"
                          disabled={quizQuestions.length <= 1}
                          onClick={() => removeQuizQuestion(question.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className="text-sm font-medium">Question Type</label>
                          <Select
                            value={question.type}
                            onValueChange={(value) => updateQuizQuestion(question.id, { type: value as QuizQuestionType })}
                          >
                            <SelectTrigger className="mt-2 rounded-lg">
                              <SelectValue placeholder="Select question type" />
                            </SelectTrigger>
                            <SelectContent>
                              {QUIZ_QUESTION_TYPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Points</label>
                          <Input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={question.points ?? 1}
                            onChange={(e) => updateQuizQuestion(question.id, { points: Number(e.target.value) || 1 })}
                            className="mt-2 rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Prompt</label>
                        <Textarea
                          value={question.prompt}
                          onChange={(event) => updateQuizQuestion(question.id, { prompt: event.target.value })}
                          placeholder={question.type === 'fill_in_blank' ? 'e.g., The capital of the Philippines is ___.' : 'Type your question prompt'}
                          className="mt-2 min-h-20 rounded-lg resize-none"
                        />
                        {question.type === 'fill_in_blank' && (
                          <p className="text-xs text-muted-foreground mt-1">Use ___ (three underscores) to mark the blank in your prompt.</p>
                        )}
                      </div>

                      {question.type === 'multiple_choice' && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Choices</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {question.choices.map((choice, choiceIndex) => (
                                <Input
                                  key={`${question.id}-${choiceIndex}`}
                                  value={choice}
                                  onChange={(event) => updateQuizChoice(question.id, choiceIndex, event.target.value)}
                                  placeholder={`Choice ${String.fromCharCode(65 + choiceIndex)}`}
                                  className="rounded-lg"
                                />
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Correct Answer</label>
                            <Select
                              value={question.answerKey || 'A'}
                              onValueChange={(value) => updateQuizQuestion(question.id, { answerKey: value })}
                            >
                              <SelectTrigger className="mt-2 rounded-lg">
                                <SelectValue placeholder="Select correct answer" />
                              </SelectTrigger>
                              <SelectContent>
                                {question.choices.map((choice, choiceIndex) => (
                                  <SelectItem key={choiceIndex} value={String.fromCharCode(65 + choiceIndex)}>
                                    {String.fromCharCode(65 + choiceIndex)}{choice.trim() ? `. ${choice.trim()}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {question.type === 'true_false' && (
                        <div>
                          <label className="text-sm font-medium">Correct Answer</label>
                          <Select
                            value={question.answerKey || 'true'}
                            onValueChange={(value) => updateQuizQuestion(question.id, { answerKey: value })}
                          >
                            <SelectTrigger className="mt-2 rounded-lg">
                              <SelectValue placeholder="Select correct answer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">True</SelectItem>
                              <SelectItem value="false">False</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {question.type !== 'multiple_choice' && question.type !== 'true_false' && (
                        <div>
                          <label className="text-sm font-medium">Accepted Answer(s)</label>
                          <Input
                            value={question.answerKey}
                            onChange={(event) => updateQuizQuestion(question.id, { answerKey: event.target.value })}
                            placeholder="Use | to separate multiple accepted answers"
                            className="mt-2 rounded-lg"
                          />
                          <p className="text-xs text-muted-foreground mt-1">e.g. photosynthesis | Photosynthesis</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg"
                onClick={addQuizQuestion}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Quiz Question
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Supports: MCQ · True/False · Short Answer · Fill in the Blank
              </Badge>
              <Badge variant="outline" className="rounded-full text-xs bg-background">
                Auto-graded · No proctoring required
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {taskType === 'exam' && (
        <Card className="border border-amber-200 bg-amber-50/60">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-semibold">Question Order Mode</label>
                <Select
                  value={examQuestionOrder}
                  onValueChange={(value) => setExamQuestionOrder(value as 'sequence' | 'random')}
                >
                  <SelectTrigger className="mt-2 rounded-lg">
                    <SelectValue placeholder="Select order mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequence">Sequential</SelectItem>
                    <SelectItem value="random">Randomized</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold">Question Selection</label>
                <Select
                  value={examQuestionSelection}
                  onValueChange={(value) => setExamQuestionSelection(value as 'sequence' | 'random')}
                >
                  <SelectTrigger className="mt-2 rounded-lg">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">Randomized</SelectItem>
                    <SelectItem value="sequence">Sequential</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-semibold">Integrity Profile</label>
                <Select
                  value={examIntegrityProfile}
                  onValueChange={(value) => setExamIntegrityProfile(value as 'standard' | 'strict')}
                >
                  <SelectTrigger className="mt-2 rounded-lg">
                    <SelectValue placeholder="Select integrity profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold">Exam Integrity Policies</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure required agreement and hard-trigger auto-submit behavior for proctored attempts.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium">Require Pre-Exam Agreement</p>
                    <p className="text-xs text-muted-foreground">Students must acknowledge rules before begin.</p>
                  </div>
                  <Switch
                    checked={examRequireAgreementBeforeStart}
                    onCheckedChange={setExamRequireAgreementBeforeStart}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium">Auto-Submit on Fullscreen Exit</p>
                    <p className="text-xs text-muted-foreground">Finalize attempt immediately on fullscreen break.</p>
                  </div>
                  <Switch
                    checked={examAutoSubmitOnFullscreenExit}
                    onCheckedChange={setExamAutoSubmitOnFullscreenExit}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Auto-Submit on Tab Switch</p>
                    <p className="text-xs text-muted-foreground">Finalize attempt when focus leaves the exam tab.</p>
                  </div>
                  <Switch
                    checked={examAutoSubmitOnTabSwitch}
                    onCheckedChange={setExamAutoSubmitOnTabSwitch}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Show One Question at a Time</p>
                    <p className="text-xs text-muted-foreground">Students see questions one by one, navigating with Previous / Next.</p>
                  </div>
                  <Switch
                    checked={examOneQuestionAtATime}
                    onCheckedChange={setExamOneQuestionAtATime}
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold">Max Violations Before Terminate</label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={examMaxViolations}
                    onChange={(event) => setExamMaxViolations(event.target.value)}
                    className="mt-2 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Import Test Questions</p>
                  <p className="text-xs text-muted-foreground">
                    Recommended file type: {QUESTION_IMPORT_RECOMMENDED_FILE_TYPE}. Questions are auto-saved after exam creation.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {QUESTION_IMPORT_DOCX_GUIDE}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    id="exam-question-import-input"
                    type="file"
                    accept={QUESTION_IMPORT_ACCEPT}
                    className="hidden"
                    onChange={(event) => {
                      void handleImportQuestionFile('exam', event);
                    }}
                  />
                  <Button type="button" variant="outline" className="rounded-lg" onClick={handleDownloadQuestionImportTemplate}>
                    Download JSON Template
                  </Button>
                  <Button type="button" className="rounded-lg" asChild>
                    <label htmlFor="exam-question-import-input" className="cursor-pointer">Import File</label>
                  </Button>
                </div>
              </div>

              {examImportFileName && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Imported source: {examImportFileName}</p>
                  <p>
                    {examImportReadyCount} of {examImportedQuestions.length} questions are ready for automatic save.
                  </p>
                  <p>
                    For exam auto-save, objective backend item types are Multiple Choice, True/False, and Short Answer.
                    Fill in the Blank and Essay are mapped to Short Answer when answer keys are provided.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-violet-200/70 bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Exam Question Builder</p>
                <Badge variant="secondary" className="rounded-full text-xs">
                  {examQuestions.length} question{examQuestions.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                Build exam questions directly in this form. Fill in the Blank and Essay entries are saved as Short Answer
                when answer keys are provided.
              </p>

              <div className="space-y-3">
                {examQuestions.map((question, index) => (
                  <Card key={question.id} className="border border-border/70 bg-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">Question {index + 1}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-destructive"
                          disabled={examQuestions.length <= 1}
                          onClick={() => removeExamQuestion(question.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Question Type</label>
                        <Select
                          value={question.type}
                          onValueChange={(value) => updateExamQuestion(question.id, { type: value as QuizQuestionType })}
                        >
                          <SelectTrigger className="mt-2 rounded-lg">
                            <SelectValue placeholder="Select question type" />
                          </SelectTrigger>
                          <SelectContent>
                            {QUIZ_QUESTION_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Prompt</label>
                        <Textarea
                          value={question.prompt}
                          onChange={(event) => updateExamQuestion(question.id, { prompt: event.target.value })}
                          placeholder="Type your exam question prompt"
                          className="mt-2 min-h-20 rounded-lg resize-none"
                        />
                      </div>

                      {question.type === 'multiple_choice' && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Choices</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {question.choices.map((choice, choiceIndex) => (
                              <Input
                                key={`${question.id}-exam-${choiceIndex}`}
                                value={choice}
                                onChange={(event) => updateExamChoice(question.id, choiceIndex, event.target.value)}
                                placeholder={`Choice ${String.fromCharCode(65 + choiceIndex)}`}
                                className="rounded-lg"
                              />
                            ))}
                          </div>

                          <div>
                            <label className="text-sm font-medium">Correct Answer Key</label>
                            <Input
                              value={question.answerKey}
                              onChange={(event) => updateExamQuestion(question.id, { answerKey: event.target.value })}
                              placeholder="Use choice text or letter (A-D)"
                              className="mt-2 rounded-lg"
                            />
                          </div>
                        </div>
                      )}

                      {question.type === 'true_false' && (
                        <div>
                          <label className="text-sm font-medium">Correct Answer</label>
                          <Select
                            value={question.answerKey || 'True'}
                            onValueChange={(value) => updateExamQuestion(question.id, { answerKey: value })}
                          >
                            <SelectTrigger className="mt-2 rounded-lg">
                              <SelectValue placeholder="Select answer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="True">True</SelectItem>
                              <SelectItem value="False">False</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {question.type !== 'multiple_choice' && question.type !== 'true_false' && (
                        <div>
                          <label className="text-sm font-medium">Answer Key</label>
                          <Input
                            value={question.answerKey}
                            onChange={(event) => updateExamQuestion(question.id, { answerKey: event.target.value })}
                            placeholder="Expected answer (use | for multiple accepted answers)"
                            className="mt-2 rounded-lg"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg"
                onClick={addExamQuestion}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Exam Question
              </Button>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Builder readiness: {examBuilderReadyCount} of {examBuilderCandidateCount} drafted questions are ready
                  for save.
                </p>
                <p>
                  Supported live attempt item types are currently Multiple Choice and True/False. Short Answer-based items
                  (including Fill in the Blank and Essay mappings) may not be playable in the current student exam player.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Use Chapter Pool Selection</p>
                  <p className="text-xs text-muted-foreground">
                    Pull questions from tagged chapter pools before ordering.
                  </p>
                </div>
                <Switch
                  checked={examChapterPoolEnabled}
                  onCheckedChange={(checked) => {
                    setExamChapterPoolEnabled(checked);
                    clearFieldError('examChapterTags');
                    clearFieldError('examQuestionsPerChapter');
                  }}
                />
              </div>

              {examChapterPoolEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-sm font-semibold">Chapter Tags</label>
                    <Input
                      placeholder="e.g., Chapter 1, Chapter 2, Algebra"
                      value={examChapterTags}
                      onChange={(e) => {
                        setExamChapterTags(e.target.value);
                        clearFieldError('examChapterTags');
                      }}
                      className={cn('mt-2 rounded-lg', errors.examChapterTags && 'border-destructive')}
                    />
                    {errors.examChapterTags && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.examChapterTags}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold">Questions per Chapter</label>
                    <Input
                      type="number"
                      min="1"
                      value={examQuestionsPerChapter}
                      onChange={(e) => {
                        setExamQuestionsPerChapter(e.target.value);
                        clearFieldError('examQuestionsPerChapter');
                      }}
                      className={cn('mt-2 rounded-lg', errors.examQuestionsPerChapter && 'border-destructive')}
                    />
                    {errors.examQuestionsPerChapter && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {errors.examQuestionsPerChapter}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold">Total Questions (optional)</label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Auto"
                      value={examTotalQuestions}
                      onChange={(e) => setExamTotalQuestions(e.target.value)}
                      className="mt-2 rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full text-xs">
                Supports: MCQ · True/False · Short Answer · Import from DOCX/JSON
              </Badge>
              <Badge variant="outline" className="rounded-full text-xs">
                Proctored · Anti-cheat · Fullscreen enforced
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const categoriesSectionContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Organize your task by adding categories. Students can filter
        by categories to find relevant content.
      </p>

      {/* Categories List */}
      {topics.length > 0 && (
        <div className="space-y-2 mb-4">
          {topics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
            >
              <span className="text-sm font-medium">{topic.name}</span>
              <button
                onClick={() => removeTopic(topic.id)}
                className="p-1 hover:bg-destructive/10 rounded transition-colors"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Category */}
      {!showTopicInput ? (
        <Button
          variant="outline"
          className="w-full rounded-lg gap-2"
          onClick={() => setShowTopicInput(true)}
        >
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="e.g., Homework, Group Work, Algebra..."
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTopic();
              }
            }}
            className="rounded-lg"
            autoFocus
          />
          <Button
            size="icon"
            className="rounded-lg shrink-0"
            onClick={addTopic}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="rounded-lg shrink-0"
            onClick={() => {
              setShowTopicInput(false);
              setNewTopic('');
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* No categories message */}
      {topics.length === 0 && !showTopicInput && (
        <Card className="border-0 bg-muted/30 mt-4">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No categories added yet. Categories help organize content and
              improve discoverability.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const attachmentsSectionContent = (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        {taskType === 'reading_material'
          ? 'Attach the reading file that students will open inside the app.'
          : 'Attach supporting files such as PDFs, documents, images, or presentations.'}
      </p>

      {/* File Upload Area */}
      <div className="relative">
        <input
          type="file"
          multiple
          onChange={handleFileAttach}
          className="hidden"
          id="file-input"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.mp4,.zip"
          disabled={isActionLocked}
        />
        <label
          htmlFor="file-input"
          className={cn(
            'block p-6 border-2 border-dashed border-border rounded-lg bg-muted/30 transition-colors text-center',
            isActionLocked
              ? 'cursor-not-allowed opacity-70 pointer-events-none'
              : 'cursor-pointer hover:bg-muted/50'
          )}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg w-fit">
              <Paperclip className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-medium">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, PowerPoint, Images, or ZIP files
            </p>
          </div>
        </label>
      </div>

      {/* Files List */}
      {files.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-sm font-semibold">Attached Files</p>
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-3 bg-card border border-border rounded-lg group hover:bg-muted/30 transition-colors"
            >
              {(() => {
                const isFileUploading = taskType === 'reading_material'
                  && isUploadingMaterial
                  && uploadingMaterialId === file.id;
                const isFileUploaded = taskType === 'reading_material'
                  && !isUploadingMaterial
                  && completedMaterialId === file.id;

                return (
                  <>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 bg-primary/10 rounded flex-shrink-0">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {file.size}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFileUploading ? (
                  <Badge variant="secondary" className="rounded-full h-5 px-2 py-0 text-[10px]">
                    Uploading {Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%
                  </Badge>
                ) : null}
                {isFileUploaded ? (
                  <Badge className="rounded-full h-5 px-2 py-0 text-[10px] bg-emerald-600 hover:bg-emerald-600">
                    Upload complete
                  </Badge>
                ) : null}
                <button
                  onClick={() => removeFile(file.id)}
                  disabled={isActionLocked}
                  className={cn(
                    'p-1 rounded transition-all',
                    isActionLocked
                      ? 'opacity-40 cursor-not-allowed'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-destructive/10'
                  )}
                >
                  <X className="h-4 w-4 text-destructive" />
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          ))}
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
              <span className="text-xs text-muted-foreground">
                {Math.max(0, Math.min(100, Math.round(materialUploadProgress)))}%
              </span>
            </div>
            <Progress value={Math.max(0, Math.min(100, Math.round(materialUploadProgress)))} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Please keep this dialog open until the upload is complete.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* No files message */}
      {files.length === 0 && (
        <Card className="border-0 bg-muted/30 mt-4">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No files attached yet. Add files to provide students with
              resources.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const formTabs = (
    <Tabs defaultValue="details" className="w-full">
      <TabsList className="grid w-full grid-cols-3 rounded-lg">
        <TabsTrigger value="details" className="rounded-md">
          Details
        </TabsTrigger>
        <TabsTrigger value="topics" className="rounded-md">
          Categories
        </TabsTrigger>
        <TabsTrigger value="files" className="rounded-md">
          Attachments
        </TabsTrigger>
      </TabsList>

      {/* Details Tab */}
      <TabsContent value="details" className="space-y-5 mt-6">
        {detailsSectionContent}
      </TabsContent>

      {/* Categories Tab */}
      <TabsContent value="topics" className="space-y-4 mt-6">
        {categoriesSectionContent}
      </TabsContent>

      {/* Files Tab */}
      <TabsContent value="files" className="space-y-4 mt-6">
        {attachmentsSectionContent}
      </TabsContent>
    </Tabs>
  );

  const pageFormSections = (
    <div className="space-y-8">
      <section className="space-y-5">
        <div className="border-b border-border pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
        </div>
        {detailsSectionContent}
      </section>

      <section className="space-y-4">
        <div className="border-b border-border pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</h3>
        </div>
        {categoriesSectionContent}
      </section>

      <section className="space-y-4">
        <div className="border-b border-border pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</h3>
        </div>
        {attachmentsSectionContent}
      </section>
    </div>
  );

  if (isPage) {
    return (
      <div className="w-full min-h-[calc(100vh-14rem)] rounded-2xl border border-border bg-card p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Create {TASK_LABELS[taskType]}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {TASK_PAGE_INTRO[taskType]}
          </p>
        </div>

        {pageFormSections}

        <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-dvw sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Task</DialogTitle>
          <DialogDescription>
            Create a reading material, activity, quiz, or exam for your class.
          </DialogDescription>
        </DialogHeader>

        {formTabs}

        <DialogFooter className="mt-6">
          {actionButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
