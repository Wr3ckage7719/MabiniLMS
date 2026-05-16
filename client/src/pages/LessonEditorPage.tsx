import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useBeforeUnload } from 'react-router-dom';
import { getClassHomePath } from '@/lib/navigation';
import {
  ArrowLeft,
  Loader2,
  Trash2,
  FileText,
  ClipboardList,
  Link as LinkIcon,
  Save,
  CheckCircle2,
  X,
  BookOpen,
  Activity,
  ClipboardCheck,
  MoreVertical,
  Copy,
  Link2,
  Users,
  CheckCheck,
  Circle,
  AlertCircle,
  Printer,
  LayoutTemplate,
  Eye,
  Clock,
  BookMarked,
  CalendarDays,
  ArrowRight,
  Info,
  Mic,
  FolderOpen,
  ShieldCheck,
  Globe,
  Timer,
  Pencil,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useTeacherLesson,
  useTeacherLessons,
  useUpdateLesson,
  useDeleteLesson,
} from '@/hooks-api/useLessons';
import { useClass } from '@/hooks-api/useClasses';
import { MaterialPreviewDialog } from '@/components/MaterialPreviewDialog';
import { materialsService } from '@/services/materials.service';
import { assignmentsService } from '@/services/assignments.service';
import { lessonsService } from '@/services/lessons.service';
import type {
  LearningMaterial,
  Lesson,
  LessonChain,
  LessonCompletionRule,
  LessonAssessmentRef,
  LessonMaterialRef,
} from '@/lib/data';

type CompletionRuleType = LessonCompletionRule['type'];
type LinkDialogState = { open: false } | { open: true; title: string; url: string };
type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface DraftState {
  title: string;
  description: string;
  topicsRaw: string;
  isPublished: boolean;
  ruleType: CompletionRuleType;
  ruleMinutes: number;
  chainNextId: string;
  unlockOnSubmit: boolean;
  unlockOnPass: boolean;
  passThreshold: number;
  unlockDelayHours: number;
}

const buildDraftFromLesson = (lesson: Lesson): DraftState => ({
  title: lesson.title === 'Untitled lesson' ? '' : lesson.title,
  description: lesson.description ?? '',
  topicsRaw: lesson.topics.join(', '),
  isPublished: lesson.isPublished,
  ruleType: lesson.completionRule.type,
  ruleMinutes:
    lesson.completionRule.type === 'time_on_material'
      ? lesson.completionRule.min_minutes
      : 10,
  chainNextId: lesson.chain.next_lesson_id ?? '__none__',
  unlockOnSubmit: lesson.chain.unlock_on_submit,
  unlockOnPass: lesson.chain.unlock_on_pass,
  passThreshold: lesson.chain.pass_threshold_percent ?? 75,
  unlockDelayHours: lesson.chain.unlock_delay_hours ?? 0,
});

const parseTopics = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

const completionRuleFromDraft = (draft: DraftState): LessonCompletionRule => {
  if (draft.ruleType === 'time_on_material') {
    return { type: 'time_on_material', min_minutes: Math.max(1, draft.ruleMinutes) };
  }
  if (draft.ruleType === 'view_all_files') {
    return { type: 'view_all_files' };
  }
  if (draft.ruleType === 'view_all_and_submit') {
    return { type: 'view_all_and_submit' };
  }
  return { type: 'mark_as_done' };
};

const chainFromDraft = (draft: DraftState): LessonChain => ({
  next_lesson_id: draft.chainNextId === '__none__' ? null : draft.chainNextId,
  unlock_on_submit: draft.unlockOnSubmit,
  unlock_on_pass: draft.unlockOnPass,
  pass_threshold_percent: draft.unlockOnPass ? draft.passThreshold : null,
  unlock_delay_hours: draft.unlockDelayHours > 0 ? draft.unlockDelayHours : null,
});

// ─── Lesson templates ────────────────────────────────────────────────────────

interface LessonTemplate {
  id: string;
  icon: string;
  name: string;
  description: string;
  defaults: Partial<DraftState>;
}

const LESSON_TEMPLATES: LessonTemplate[] = [
  {
    id: 'reading-quiz',
    icon: '📖',
    name: 'Reading + Quiz',
    description: 'Upload a reading material and attach a short quiz.',
    defaults: {
      title: '',
      description: 'Read through the material carefully, then complete the quiz to check your understanding.',
      topicsRaw: '',
      ruleType: 'view_all_files',
    },
  },
  {
    id: 'lecture',
    icon: '🎓',
    name: 'Lecture',
    description: 'Share a lecture file or video — students mark done when finished.',
    defaults: {
      title: '',
      description: 'Watch or read the lecture material and take notes. Mark the lesson as done when you are ready to move on.',
      topicsRaw: '',
      ruleType: 'mark_as_done',
    },
  },
  {
    id: 'lab-activity',
    icon: '🔬',
    name: 'Lab Activity',
    description: 'Hands-on activity or worksheet with a submission.',
    defaults: {
      title: '',
      description: 'Complete the activity and submit your work before the due date.',
      topicsRaw: '',
      ruleType: 'mark_as_done',
    },
  },
  {
    id: 'exam-review',
    icon: '📝',
    name: 'Exam Review',
    description: 'Preparatory materials before a major exam.',
    defaults: {
      title: 'Exam Review',
      description: 'Review the materials below to prepare for the upcoming exam. Focus on key concepts and practice exercises.',
      topicsRaw: 'Review',
      ruleType: 'mark_as_done',
    },
  },
  {
    id: 'discussion-reflection',
    icon: '💬',
    name: 'Discussion / Reflection',
    description: 'Prompt students to reflect, discuss, or journal after reading.',
    defaults: {
      title: '',
      description: 'Read or watch the provided material, then write a short reflection. Consider:\n- What was the most important idea?\n- How does this connect to what you already know?\n- What questions do you still have?',
      topicsRaw: '',
      ruleType: 'mark_as_done',
    },
  },
  {
    id: 'video-walkthrough',
    icon: '🎥',
    name: 'Video Walkthrough',
    description: 'Guide students through a video or screencast with notes.',
    defaults: {
      title: '',
      description: 'Watch the video from start to finish. Pause and take notes on key steps. You must reach the end before marking this lesson as done.',
      topicsRaw: '',
      ruleType: 'view_all_files',
    },
  },
  {
    id: 'practice-set',
    icon: '✏️',
    name: 'Practice Set',
    description: 'Focused practice exercises — spend at least 15 minutes working through them.',
    defaults: {
      title: '',
      description: 'Work through all practice problems below. Show your reasoning and check your answers. Spend a minimum of 15 minutes on this material.',
      topicsRaw: '',
      ruleType: 'time_on_material',
      ruleMinutes: 15,
    },
  },
];

// ─── Chip components ─────────────────────────────────────────────────────────

interface MaterialChipProps {
  material: LessonMaterialRef;
  isRequired: boolean;
  onPreview: () => void;
  onRemove: () => void;
  onToggleOptional: () => void;
  removing: boolean;
  toggling: boolean;
}

function MaterialChip({ material, isRequired, onPreview, onRemove, onToggleOptional, removing, toggling }: MaterialChipProps) {
  const isLink = material.file_type === 'link';
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-secondary/40">
      <button
        type="button"
        onClick={isLink && material.url ? () => window.open(material.url, '_blank', 'noopener') : onPreview}
        className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
        aria-label={isLink ? `Open ${material.title}` : `Preview ${material.title}`}
      >
        {isLink
          ? <Globe className="h-4 w-4 text-primary flex-shrink-0" />
          : <FileText className="h-4 w-4 text-primary flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{material.title}</p>
          <p className="text-xs text-muted-foreground">
            {isLink ? <span className="text-primary/70 truncate block">{material.url}</span> : (
              <>
                <span className="uppercase">{material.file_type}</span> · {material.file_size}
                {typeof material.page_count === 'number' && material.page_count > 0
                  ? ` · ${material.page_count} ${material.page_count === 1 ? 'page' : 'pages'}`
                  : ''}
              </>
            )}
          </p>
        </div>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleOptional}
            disabled={toggling}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
              material.is_optional
                ? 'border-muted-foreground/30 text-muted-foreground hover:border-primary/40 hover:text-primary'
                : isRequired
                  ? 'border-primary/40 text-primary hover:border-muted-foreground/30 hover:text-muted-foreground'
                  : 'border-muted-foreground/30 text-muted-foreground'
            }`}
          >
            {toggling ? '…' : (material.is_optional ? 'Optional' : 'Required')}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{material.is_optional ? 'Click to make required' : 'Click to make optional'}</p>
        </TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${material.title}`}
      >
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const assessmentTypeIcon = (rawType: LessonAssessmentRef['raw_type']) => {
  if (rawType === 'quiz') return FileText;
  if (rawType === 'exam') return ClipboardCheck;
  if (rawType === 'activity') return Activity;
  return ClipboardList;
};

interface AssessmentChipProps {
  assessment: LessonAssessmentRef;
  onRemove: () => void;
  removing: boolean;
}

function AssessmentChip({ assessment, onRemove, removing }: AssessmentChipProps) {
  const Icon = assessmentTypeIcon(assessment.raw_type);
  const navigate = useNavigate();
  const { id: classId, lessonId } = useParams();
  const dueDateLabel = assessment.due_date
    ? new Date(assessment.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-secondary/40">
      <Icon className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{assessment.title}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="uppercase">{assessment.raw_type}</span>
          <span>·</span>
          <span>{assessment.points} pts</span>
          {assessment.is_optional ? (
            <>
              <span>·</span>
              <span className="italic">optional</span>
            </>
          ) : (
            <>
              <span>·</span>
              <Badge variant="outline" className="text-xs h-4 px-1 border-primary/40 text-primary">Required</Badge>
            </>
          )}
          {dueDateLabel && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Due {dueDateLabel}
              </span>
            </>
          )}
          {assessment.is_proctored && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 text-amber-600">
                <ShieldCheck className="h-3 w-3" /> Proctored
              </span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground flex-shrink-0"
        onClick={() => navigate(`/class/${classId}/lessons/${lessonId}/assessments/${assessment.assignment_id}/edit`)}
        aria-label={`Edit ${assessment.title}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground flex-shrink-0"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${assessment.title}`}
      >
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

const lessonMaterialFileTypeToLearning = (
  fileType: LessonMaterialRef['file_type']
): LearningMaterial['fileType'] => {
  if (fileType === 'pdf') return 'pdf';
  if (fileType === 'doc' || fileType === 'docx') return 'doc';
  if (fileType === 'ppt' || fileType === 'pptx') return 'presentation';
  if (fileType === 'image') return 'image';
  if (fileType === 'video') return 'video';
  if (fileType === 'archive') return 'archive';
  return 'doc';
};

const toPreviewMaterial = (
  material: LessonMaterialRef,
  classId: string
): LearningMaterial => ({
  id: material.material_id,
  classId,
  title: material.title,
  description: '',
  fileType: lessonMaterialFileTypeToLearning(material.file_type),
  fileSize: material.file_size,
  uploadedBy: '',
  uploadedDate: '',
  downloads: 0,
  url: material.url,
});

// ─── Main component ──────────────────────────────────────────────────────────

export default function LessonEditorPage() {
  const { id, lessonId } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const classQuery = useClass(classId);
  const lessonQuery = useTeacherLesson(classId, lessonId);
  const lessonsQuery = useTeacherLessons(classId);
  const updateLesson = useUpdateLesson(classId);
  const deleteLesson = useDeleteLesson(classId);

  const lesson = lessonQuery.data ?? null;
  const allLessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [previewMaterial, setPreviewMaterial] = useState<LessonMaterialRef | null>(null);
  const [removingMaterialId, setRemovingMaterialId] = useState<string | null>(null);
  const [removingAssessmentId, setRemovingAssessmentId] = useState<string | null>(null);
  const [togglingMaterialId, setTogglingMaterialId] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState>({ open: false });
  const [addingLink, setAddingLink] = useState(false);
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [autosaveDoneAt, setAutosaveDoneAt] = useState<number | null>(null);

  // Refs for stable keyboard-shortcut handlers
  const persistRef = useRef<(publish: boolean) => Promise<void>>(async () => {});
  const validationErrorsRef = useRef<{ field: string; message: string }[]>([]);
  const isFirstDraftRender = useRef(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (lesson && !draft) {
      setDraft(buildDraftFromLesson(lesson));
    }
  }, [lesson, draft]);

  // Force-refresh lesson data when returning from sub-pages
  useEffect(() => {
    if (!classId || !lessonId) return;
    void queryClient.refetchQueries({ queryKey: ['lessons', 'teacher', classId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, lessonId]);

  const otherLessons = useMemo(() => {
    if (!lesson) return allLessons;
    return allLessons.filter((other) => other.id !== lesson.id);
  }, [allLessons, lesson]);

  // ─── Computed state ───────────────────────────────────────────────────────

  const validationErrors = useMemo(() => {
    if (!draft) return [];
    const errs: { field: string; message: string }[] = [];
    if (draft.title.trim().length === 0) {
      errs.push({ field: 'title', message: 'A lesson title is required to publish.' });
    }
    return errs;
  }, [draft]);

  // Keep ref in sync for keyboard handler
  useEffect(() => { validationErrorsRef.current = validationErrors; }, [validationErrors]);

  const isDirty = useMemo(() => {
    if (!draft || !lesson) return false;
    return (
      (draft.title.trim() || 'Untitled lesson') !== lesson.title ||
      (draft.description.trim() || null) !== lesson.description ||
      draft.topicsRaw !== lesson.topics.join(', ') ||
      draft.ruleType !== lesson.completionRule.type ||
      draft.chainNextId !== (lesson.chain.next_lesson_id ?? '__none__') ||
      draft.unlockOnSubmit !== lesson.chain.unlock_on_submit ||
      draft.unlockOnPass !== lesson.chain.unlock_on_pass
    );
  }, [draft, lesson]);

  // Suggest topic tags from other lessons in this class
  const suggestedTopics = useMemo(() => {
    const freq = new Map<string, number>();
    for (const l of allLessons) {
      if (l.id === lesson?.id) continue;
      for (const t of l.topics) {
        const key = t.toLowerCase();
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
    }
    // Return top 5 by frequency, excluding ones already in the current raw
    const current = new Set(parseTopics(draft?.topicsRaw ?? '').map((t) => t.toLowerCase()));
    return [...freq.entries()]
      .filter(([key]) => !current.has(key))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => {
        // Preserve original casing from the source lesson
        for (const l of allLessons) {
          const match = l.topics.find((t) => t.toLowerCase() === key);
          if (match) return match;
        }
        return key;
      });
  }, [allLessons, lesson?.id, draft?.topicsRaw]);

  const setupChecklist = useMemo(() => {
    if (!draft || !lesson) return [];
    return [
      { id: 'title', label: 'Title', done: draft.title.trim().length > 0, required: true, href: '#section-basics' },
      { id: 'description', label: 'Description', done: draft.description.trim().length > 0, required: false, href: '#section-basics' },
      { id: 'materials', label: 'Materials', done: lesson.materials.length > 0, required: false, href: '#section-materials' },
      { id: 'completion', label: 'Completion rule', done: true, required: false, href: '#section-completion' },
      { id: 'assessments', label: 'Assessments', done: lesson.assessments.length > 0, required: false, href: '#section-assessments' },
      { id: 'chain', label: 'Next lesson linked', done: draft.chainNextId !== '__none__', required: false, href: '#section-chain' },
    ];
  }, [draft, lesson]);

  const checklistDoneCount = useMemo(
    () => setupChecklist.filter((c) => c.done).length,
    [setupChecklist]
  );

  const descStats = useMemo(() => {
    const chars = (draft?.description ?? '').length;
    const words = (draft?.description ?? '').trim().split(/\s+/).filter(Boolean).length;
    return { chars, words };
  }, [draft?.description]);

  const estimatedMinutes = useMemo(() => {
    if (!lesson) return null;
    const materialMins = lesson.materials.length * 8;
    const assessmentMins = lesson.assessments.length * 10;
    const total = materialMins + assessmentMins;
    if (total === 0) return null;
    return Math.max(5, Math.round(total / 5) * 5);
  }, [lesson?.materials.length, lesson?.assessments.length]);

  // Lessons in this class that chain INTO the current lesson
  const incomingLessons = useMemo(() => {
    if (!lesson) return [];
    return allLessons.filter((l) => l.chain.next_lesson_id === lesson.id);
  }, [allLessons, lesson?.id]);

  // ─── Autosave ─────────────────────────────────────────────────────────────

  const refreshLesson = useCallback(async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['lessons', 'teacher', classId] }),
      queryClient.refetchQueries({ queryKey: ['lessons', 'student', classId] }),
    ]);
  }, [classId, queryClient]);

  const silentlyPersistDraft = useCallback(async (): Promise<boolean> => {
    if (!draft || !lesson) return false;
    try {
      await updateLesson.mutateAsync({
        lessonId: lesson.id,
        payload: {
          title: draft.title.trim() || 'Untitled lesson',
          description: draft.description.trim() ? draft.description.trim() : null,
          topics: parseTopics(draft.topicsRaw),
          isPublished: lesson.isPublished,
          completionRule: completionRuleFromDraft(draft),
          chain: chainFromDraft(draft),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] });
      return true;
    } catch (error) {
      toast({
        title: 'Could not save lesson before opening builder',
        description: error instanceof Error ? error.message : 'Please save manually first.',
        variant: 'destructive',
      });
      return false;
    }
  }, [draft, lesson, updateLesson, queryClient, classId, toast]);

  useEffect(() => {
    if (isFirstDraftRender.current) { isFirstDraftRender.current = false; return; }
    if (!draft || !lesson?.id) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    setAutosaveStatus('idle');
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus('saving');
      const ok = await silentlyPersistDraft();
      if (ok) { setAutosaveStatus('saved'); setAutosaveDoneAt(Date.now()); }
      else setAutosaveStatus('error');
    }, 1500);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Warn on tab close when there are unsaved changes
  useBeforeUnload(
    useCallback(
      (e: BeforeUnloadEvent) => {
        if (isDirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      },
      [isDirty]
    )
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (isDirty) {
      const ok = window.confirm('You have unsaved changes. Leave without saving?');
      if (!ok) return;
    }
    navigate(getClassHomePath('teacher', classId));
  };

  const handleRemoveMaterial = async (materialId: string, materialTitle: string) => {
    if (removingMaterialId) return;
    const confirmed = window.confirm(`Remove "${materialTitle}" from this lesson? The file will be deleted.`);
    if (!confirmed) return;
    setRemovingMaterialId(materialId);
    try {
      await materialsService.delete(materialId);
      await refreshLesson();
      toast({ title: 'Material removed' });
    } catch (error) {
      toast({
        title: 'Could not remove material',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRemovingMaterialId(null);
    }
  };

  const handleRemoveAssessment = async (assignmentId: string, assignmentTitle: string) => {
    if (removingAssessmentId) return;
    const confirmed = window.confirm(`Remove "${assignmentTitle}" from this lesson? Submissions and grades will be lost.`);
    if (!confirmed) return;
    setRemovingAssessmentId(assignmentId);
    try {
      await assignmentsService.deleteAssignment(classId, assignmentId);
      await refreshLesson();
      toast({ title: 'Assessment removed' });
    } catch (error) {
      toast({
        title: 'Could not remove assessment',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRemovingAssessmentId(null);
    }
  };

  const persist = useCallback(async (publish: boolean) => {
    if (!draft || !lesson) return;
    if (publish) {
      setPublishAttempted(true);
      if (validationErrorsRef.current.length > 0) {
        toast({
          title: 'Cannot publish',
          description: validationErrorsRef.current[0].message,
          variant: 'destructive',
        });
        return;
      }
    }
    setSaving(true);
    try {
      await updateLesson.mutateAsync({
        lessonId: lesson.id,
        payload: {
          title: draft.title.trim() || 'Untitled lesson',
          description: draft.description.trim() ? draft.description.trim() : null,
          topics: parseTopics(draft.topicsRaw),
          isPublished: publish,
          completionRule: completionRuleFromDraft(draft),
          chain: chainFromDraft(draft),
        },
      });
      setAutosaveStatus('saved');
      setAutosaveDoneAt(Date.now());
      toast({
        title: publish ? 'Lesson published' : 'Draft saved',
        description: publish
          ? 'Students can now see this lesson.'
          : 'Your changes are saved. Publish when you are ready.',
      });
      navigate(getClassHomePath('teacher', classId));
    } catch (error) {
      toast({
        title: 'Could not save lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [draft, lesson, updateLesson, classId, navigate, toast]);

  // Keep ref in sync for keyboard handler
  useEffect(() => { persistRef.current = persist; }, [persist]);

  const handleDelete = async () => {
    if (!lesson) return;
    try {
      await deleteLesson.mutateAsync(lesson.id);
      toast({ title: 'Lesson deleted' });
      setDeleteDialogOpen(false);
      navigate(getClassHomePath('teacher', classId));
    } catch (error) {
      toast({
        title: 'Could not delete lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async () => {
    if (!lesson || !draft || duplicating) return;
    setDuplicating(true);
    try {
      const newLesson = await lessonsService.createDraft(classId);
      await updateLesson.mutateAsync({
        lessonId: newLesson.id,
        payload: {
          title: `${draft.title.trim() || lesson.title} (copy)`,
          description: draft.description.trim() || null,
          topics: parseTopics(draft.topicsRaw),
          isPublished: false,
          completionRule: completionRuleFromDraft(draft),
          chain: { next_lesson_id: null, unlock_on_submit: false, unlock_on_pass: false, pass_threshold_percent: null },
        },
      });
      await queryClient.refetchQueries({ queryKey: ['lessons', 'teacher', classId] });
      toast({ title: 'Lesson duplicated', description: 'A copy has been added as a new draft.' });
      navigate(getClassHomePath('teacher', classId));
    } catch (error) {
      toast({
        title: 'Could not duplicate lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDuplicating(false);
    }
  };

  const handleCopyStudentLink = () => {
    const url = `${window.location.origin}/class/${classId}/lessons/${lesson?.id}`;
    void navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied', description: 'Student lesson link copied to clipboard.' });
    });
  };

  const handleToggleMaterialOptional = async (materialId: string, currentIsOptional: boolean) => {
    if (togglingMaterialId) return;
    setTogglingMaterialId(materialId);
    try {
      await lessonsService.toggleMaterialOptional(classId, lesson!.id, materialId, !currentIsOptional);
      await refreshLesson();
    } catch (error) {
      toast({
        title: 'Could not update material',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTogglingMaterialId(null);
    }
  };

  const handleAddLink = async () => {
    if (!linkDialog.open) return;
    setAddingLink(true);
    try {
      await lessonsService.createLinkMaterial(classId, lesson!.id, linkDialog.title, linkDialog.url);
      await refreshLesson();
      setLinkDialog({ open: false });
      toast({ title: 'Link added' });
    } catch (error) {
      toast({
        title: 'Could not add link',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAddingLink(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePreviewAsStudent = () => {
    const url = `${window.location.origin}/class/${classId}/lessons/${lesson?.id}`;
    window.open(url, '_blank', 'noopener');
  };

  const handleApplyTemplate = (template: LessonTemplate) => {
    setDraft((current) => current ? { ...current, ...template.defaults } : current);
    setTemplateDialogOpen(false);
    toast({ title: `Template applied: ${template.name}` });
  };

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') {
        e.preventDefault();
        void persistRef.current(false);
      }
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        if (validationErrorsRef.current.length === 0) void persistRef.current(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ─── Loading / not-found states ───────────────────────────────────────────

  if (lessonQuery.isLoading || classQuery.isLoading || !draft) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-24 rounded-xl" />
            <Skeleton className="h-8 w-48" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20 rounded-xl" />
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <div className="hidden lg:block">
            <div className="sticky top-20 pt-2 space-y-2">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-3 text-center">
        <p className="text-lg font-semibold">Lesson not found</p>
        <Button variant="outline" onClick={handleBack} className="rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to lessons
        </Button>
      </div>
    );
  }

  const update = (patch: Partial<DraftState>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const isMaterialRequired = lesson.completionRule.type === 'view_all_files';

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background print:bg-white">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="rounded-xl gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back to lessons
            </Button>

            <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[180px]">
              {classQuery.data?.name}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="text-xs text-muted-foreground font-mono">
                Lesson {lesson.ordering.toString().padStart(2, '0')}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
                    <LayoutTemplate className="h-4 w-4 mr-2" /> Apply template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyStudentLink}>
                    <Link2 className="h-4 w-4 mr-2" /> Copy student link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePreviewAsStudent}>
                    <Eye className="h-4 w-4 mr-2" /> Preview as student
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-2" /> Print lesson
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleDuplicate()}
                    disabled={duplicating}
                  >
                    {duplicating
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <Copy className="h-4 w-4 mr-2" />}
                    Duplicate lesson
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete lesson
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div className="max-w-6xl mx-auto px-4 md:px-6 pb-44 md:pb-40">
          <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 lg:items-start">

            {/* ── SIDEBAR ──────────────────────────────────────────────── */}
            <aside className="hidden lg:block print:hidden">
              <div className="sticky top-20 pt-8 space-y-5">

                {/* Setup checklist */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-2">
                    Setup · {checklistDoneCount}/{setupChecklist.length}
                  </p>
                  <div className="space-y-0.5">
                    {setupChecklist.map((item) => (
                      <a
                        key={item.id}
                        href={item.href}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm hover:bg-secondary/50 transition-colors"
                      >
                        {item.done
                          ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />}
                        <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                          {item.label}
                        </span>
                        {item.required && !item.done && (
                          <span className="ml-auto text-[10px] font-medium text-destructive/70">req.</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>

                {/* Student activity stats */}
                {lesson.stats && (lesson.stats.total_students ?? 0) > 0 && (
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Activity
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{lesson.stats.total_students} enrolled</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>
                        {lesson.stats.completed_students} completed
                        {(lesson.stats.total_students ?? 0) > 0
                          ? ` (${Math.round((lesson.stats.completed_students / lesson.stats.total_students) * 100)}%)`
                          : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Lesson at a glance */}
                <div className="rounded-lg border p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    At a glance
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{lesson.materials.length} material{lesson.materials.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ClipboardList className="h-3.5 w-3.5" />
                    <span>{lesson.assessments.length} assessment{lesson.assessments.length !== 1 ? 's' : ''}</span>
                  </div>
                  {estimatedMinutes !== null && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>~{estimatedMinutes} min estimated</span>
                    </div>
                  )}
                  {draft.chainNextId !== '__none__' && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BookMarked className="h-3.5 w-3.5" />
                      <span className="truncate">
                        Leads to: {otherLessons.find((l) => l.id === draft.chainNextId)?.title ?? 'next lesson'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Keyboard hints */}
                <div className="rounded-lg border border-dashed p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Shortcuts
                  </p>
                  <p className="text-xs text-muted-foreground"><kbd className="font-mono bg-secondary px-1 rounded">⌘S</kbd> Save draft</p>
                  <p className="text-xs text-muted-foreground"><kbd className="font-mono bg-secondary px-1 rounded">⌘↵</kbd> Publish</p>
                </div>
              </div>
            </aside>

            {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
            <main className="py-6 md:py-8 space-y-6 animate-in fade-in duration-300">
              <section className="print:block">
                <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                  {lesson.isPublished ? 'Edit lesson' : 'New lesson'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Add materials and assessments. Students can't see this until you publish.
                </p>
              </section>

              {/* ── BASICS ─────────────────────────────────────────────── */}
              <Card id="section-basics" className="border shadow-sm">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="lesson-title">Title</Label>
                    <Input
                      id="lesson-title"
                      value={draft.title}
                      onChange={(event) => update({ title: event.target.value })}
                      placeholder="e.g. Power Supply Units"
                      className={publishAttempted && draft.title.trim().length === 0 ? 'border-destructive focus-visible:ring-destructive' : ''}
                    />
                    {publishAttempted && draft.title.trim().length === 0 && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Title is required to publish.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lesson-topics">Topic tags</Label>
                    <Input
                      id="lesson-topics"
                      value={draft.topicsRaw}
                      onChange={(event) => update({ topicsRaw: event.target.value })}
                      placeholder="Hardware, Foundations"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated. Used by the topic filter on the student lesson list.
                    </p>
                    {suggestedTopics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <span className="text-xs text-muted-foreground self-center">Suggestions:</span>
                        {suggestedTopics.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const current = draft.topicsRaw.trim();
                              update({ topicsRaw: current ? `${current}, ${tag}` : tag });
                            }}
                            className="text-xs px-2 py-0.5 rounded-full border bg-secondary/50 hover:bg-secondary transition-colors"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lesson-description">Description</Label>
                    <Textarea
                      id="lesson-description"
                      value={draft.description}
                      onChange={(event) => update({ description: event.target.value })}
                      rows={3}
                      placeholder="What will the student learn or do in this lesson?"
                    />
                    <p className={`text-xs transition-colors ${
                      descStats.chars === 0
                        ? 'text-muted-foreground/50'
                        : descStats.chars < 50
                          ? 'text-amber-500'
                          : descStats.chars <= 600
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                    }`}>
                      {descStats.chars} characters · {descStats.words} words
                      {descStats.chars === 0 && ' · aim for 50–600 characters'}
                    </p>
                    {descStats.chars === 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <span className="text-xs text-muted-foreground self-center">Quick start:</span>
                        {[
                          { label: '📚 Learning goals', text: 'By the end of this lesson, students will be able to:\n- \n- \n- ' },
                          { label: '📋 Step-by-step', text: 'What to do:\n1. \n2. \n3. ' },
                          { label: '🎯 Key concepts', text: 'Focus on the following key concepts:\n- \n- \n- ' },
                        ].map(({ label, text }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => update({ description: text })}
                            className="text-xs px-2 py-0.5 rounded-full border bg-secondary/50 hover:bg-secondary transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ── MATERIALS ──────────────────────────────────────────── */}
              <Card id="section-materials" className="border shadow-sm">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">Materials</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        PDF, DOCX, PPTX, images, or video. Students view in-app with progress tracked.
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        disabled={updateLesson.isPending}
                        onClick={async () => {
                          const ok = await silentlyPersistDraft();
                          if (ok) navigate(`/class/${classId}/lessons/${lesson.id}/new/reading-material`);
                        }}
                      >
                        {updateLesson.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <BookOpen className="h-3.5 w-3.5" />}
                        Add reading material
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={() => setLinkDialog({ open: true, title: '', url: '' })}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Add external link
                      </Button>
                    </div>
                  </div>

                  {lesson.materials.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No materials yet. Click <em>Add reading material</em> to upload a file
                      students can view with reading progress tracked.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lesson.materials.map((material) => (
                        <MaterialChip
                          key={material.material_id}
                          material={material}
                          isRequired={isMaterialRequired}
                          onPreview={() => setPreviewMaterial(material)}
                          onRemove={() => void handleRemoveMaterial(material.material_id, material.title)}
                          onToggleOptional={() => void handleToggleMaterialOptional(material.material_id, material.is_optional ?? false)}
                          removing={removingMaterialId === material.material_id}
                          toggling={togglingMaterialId === material.material_id}
                        />
                      ))}
                      {lesson.materials.length > 1 && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
                          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          {draft.ruleType === 'view_all_files'
                            ? 'Sequential mode is on — students must reach the end of each file before the next one unlocks.'
                            : 'Files are shown in order. To enforce sequential reading, set the completion rule to "Reach end of all materials".'}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── COMPLETION RULE ────────────────────────────────────── */}
              <Card id="section-completion" className="border shadow-sm">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">Completion rule</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        What lets the student press <em>Mark as done</em>.
                      </p>
                    </div>
                    {estimatedMinutes !== null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-full whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        ~{estimatedMinutes} min est.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {(
                      [
                        {
                          id: 'mark_as_done',
                          label: 'Student presses Mark as done',
                          hint: 'The button is always available. Student decides when they are finished — no tracking enforced.',
                        },
                        {
                          id: 'view_all_files',
                          label: 'Reach end of all materials',
                          hint: 'Student must scroll or page through every required file to the end before the button appears. Files are locked sequentially.',
                        },
                        {
                          id: 'view_all_and_submit',
                          label: 'View all materials + submit all assessments',
                          hint: 'Student must both reach the end of every required file AND submit every required assessment. Assessments are unlocked while the lesson is active so students can complete them before marking done.',
                        },
                        {
                          id: 'time_on_material',
                          label: 'Time on material ≥ N minutes',
                          hint: 'Tracks active time the student has the lesson open. Timer pauses when the tab is hidden or the window loses focus.',
                        },
                      ] as { id: CompletionRuleType; label: string; hint: string }[]
                    ).map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          draft.ruleType === option.id ? 'border-primary bg-primary/5' : 'hover:bg-secondary/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="completion-rule"
                          value={option.id}
                          checked={draft.ruleType === option.id}
                          onChange={() => update({ ruleType: option.id })}
                          className="h-4 w-4 mt-0.5"
                        />
                        <div>
                          <span className="text-sm font-medium">{option.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{option.hint}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {draft.ruleType === 'time_on_material' && (
                    <div className="flex items-center gap-3">
                      <Label htmlFor="rule-minutes" className="text-xs">
                        Minimum minutes
                      </Label>
                      <Input
                        id="rule-minutes"
                        type="number"
                        min={1}
                        max={240}
                        value={draft.ruleMinutes}
                        onChange={(event) =>
                          update({ ruleMinutes: Number.parseInt(event.target.value || '1', 10) })
                        }
                        className="w-24"
                      />
                    </div>
                  )}

                  {incomingLessons.length > 0 && (
                    <div className="rounded-lg bg-secondary/40 px-3 py-2.5 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Unlocked by completing:</p>
                      <div className="space-y-1">
                        {incomingLessons.map((l) => (
                          <div key={l.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                            <span>Lesson {l.ordering.toString().padStart(2, '0')} · {l.title}</span>
                            {l.chain.unlock_on_pass && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 ml-auto">Pass required</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── ASSESSMENTS ────────────────────────────────────────── */}
              <Card id="section-assessments" className="border shadow-sm">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Assessments</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Unlock after the student marks this lesson as done.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { type: 'activity', label: 'Add activity', icon: Activity },
                          { type: 'quiz', label: 'Add quiz', icon: FileText },
                          { type: 'exam', label: 'Add exam', icon: ClipboardCheck },
                          { type: 'recitation', label: 'Add recitation', icon: Mic },
                          { type: 'project', label: 'Add project', icon: FolderOpen },
                        ] as { type: string; label: string; icon: React.ElementType }[]
                      ).map(({ type, label, icon: Icon }) => (
                        <Button
                          key={type}
                          variant="outline"
                          size="sm"
                          className="rounded-xl gap-1.5"
                          disabled={updateLesson.isPending}
                          onClick={async () => {
                            const ok = await silentlyPersistDraft();
                            if (ok) navigate(`/class/${classId}/lessons/${lesson.id}/new/${type}`);
                          }}
                        >
                          {updateLesson.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Icon className="h-3.5 w-3.5" />}
                          {label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      Assessments unlock after the student marks this lesson as done. Exams with proctoring enabled will track tab-switching violations.
                    </p>
                  </div>

                  {lesson.assessments.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      No assessments yet. Lessons without assessments unlock the next lesson
                      as soon as they're marked done.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lesson.assessments.map((assessment) => (
                        <AssessmentChip
                          key={assessment.assignment_id}
                          assessment={assessment}
                          onRemove={() => void handleRemoveAssessment(assessment.assignment_id, assessment.title)}
                          removing={removingAssessmentId === assessment.assignment_id}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── CHAIN ──────────────────────────────────────────────── */}
              <Card id="section-chain" className="border shadow-sm">
                <CardContent className="p-5 md:p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" /> Chain
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      What the student unlocks after finishing this lesson and its assessments.
                    </p>
                  </div>

                  {/* Mini-flow diagram */}
                  <div className="flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2.5 text-xs overflow-x-auto">
                    {incomingLessons.length > 0 && (
                      <>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          {incomingLessons.slice(0, 2).map((l) => (
                            <span key={l.id} className="font-mono text-muted-foreground whitespace-nowrap">
                              Lesson {l.ordering.toString().padStart(2, '0')}
                            </span>
                          ))}
                          {incomingLessons.length > 2 && (
                            <span className="text-muted-foreground">+{incomingLessons.length - 2} more</span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </>
                    )}
                    <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded border border-primary/40 bg-primary/5 shrink-0">
                      <span className="font-mono font-semibold text-primary whitespace-nowrap">
                        Lesson {lesson.ordering.toString().padStart(2, '0')}
                      </span>
                      <span className="text-muted-foreground truncate max-w-[120px]">{draft.title || 'Untitled'}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      {draft.chainNextId === '__none__' ? (
                        <span className="text-muted-foreground italic">No next lesson</span>
                      ) : (
                        <>
                          {(() => {
                            const next = otherLessons.find((l) => l.id === draft.chainNextId);
                            return next ? (
                              <>
                                <span className="font-mono font-medium whitespace-nowrap">
                                  Lesson {next.ordering.toString().padStart(2, '0')}
                                </span>
                                <span className="text-muted-foreground truncate max-w-[120px]">{next.title}</span>
                              </>
                            ) : null;
                          })()}
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {draft.unlockOnSubmit && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">Submit required</Badge>
                            )}
                            {draft.unlockOnPass && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">Pass {draft.passThreshold}%</Badge>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Unlock next lesson</Label>
                    <Select
                      value={draft.chainNextId}
                      onValueChange={(value) => update({ chainNextId: value })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No next lesson</SelectItem>
                        {otherLessons.map((other) => (
                          <SelectItem key={other.id} value={other.id}>
                            Lesson {other.ordering.toString().padStart(2, '0')} · {other.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5" /> Unlock delay after completion
                    </Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={String(draft.unlockDelayHours)}
                        onValueChange={(v) => update({ unlockDelayHours: Number(v) })}
                      >
                        <SelectTrigger className="h-9 w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Immediate (no delay)</SelectItem>
                          <SelectItem value="1">1 hour</SelectItem>
                          <SelectItem value="2">2 hours</SelectItem>
                          <SelectItem value="6">6 hours</SelectItem>
                          <SelectItem value="12">12 hours</SelectItem>
                          <SelectItem value="24">1 day</SelectItem>
                          <SelectItem value="48">2 days</SelectItem>
                          <SelectItem value="72">3 days</SelectItem>
                          <SelectItem value="168">1 week</SelectItem>
                        </SelectContent>
                      </Select>
                      {draft.unlockDelayHours > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Next lesson unlocks {draft.unlockDelayHours}h after this one is marked done.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm">
                      <Switch
                        checked={draft.unlockOnSubmit}
                        onCheckedChange={(checked) => update({ unlockOnSubmit: checked })}
                      />
                      Require all assessments submitted
                    </label>
                    <label className="flex items-center gap-3 text-sm">
                      <Switch
                        checked={draft.unlockOnPass}
                        onCheckedChange={(checked) => update({ unlockOnPass: checked })}
                      />
                      Require pass threshold
                    </label>
                    {draft.unlockOnPass && (
                      <div className="ml-12 flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={draft.passThreshold}
                          onChange={(event) =>
                            update({
                              passThreshold: Math.max(
                                0,
                                Math.min(100, Number.parseInt(event.target.value || '0', 10))
                              ),
                            })
                          }
                          className="w-24"
                        />
                        <span className="text-xs text-muted-foreground">% across assessments</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {/* ── DANGER ZONE ────────────────────────────────────────── */}
              <Card id="section-danger" className="border border-destructive/30 shadow-sm">
                <CardContent className="p-5 md:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Deleting this lesson removes its materials, assessments, and student progress for everyone in this class. This cannot be undone.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive shrink-0"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete lesson
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </main>
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <footer className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur print:hidden">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant="outline"
                className={
                  lesson.isPublished
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }
              >
                {lesson.isPublished ? 'Published' : 'Draft'}
              </Badge>
              {autosaveStatus === 'saving' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {autosaveStatus === 'saved' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Saved
                </span>
              )}
              {autosaveStatus === 'error' && (
                <span className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Autosave failed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-xl gap-1.5"
                disabled={saving}
                onClick={() => void persist(false)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save as draft
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span required: disabled button doesn't fire mouse events for tooltip */}
                  <span tabIndex={validationErrors.length > 0 ? 0 : undefined}>
                    <Button
                      className="rounded-xl gap-1.5"
                      disabled={saving || validationErrors.length > 0}
                      onClick={() => void persist(true)}
                    >
                      {saving
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4" />}
                      Publish lesson
                    </Button>
                  </span>
                </TooltipTrigger>
                {validationErrors.length > 0 && (
                  <TooltipContent side="top">
                    <p>{validationErrors[0].message}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        </footer>

        {/* ── DIALOGS ────────────────────────────────────────────────────── */}

        <MaterialPreviewDialog
          open={previewMaterial !== null}
          material={previewMaterial ? toPreviewMaterial(previewMaterial, classId) : null}
          onOpenChange={(next) => { if (!next) setPreviewMaterial(null); }}
          isTeacher
          courseId={classId}
        />

        {/* Delete confirmation */}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={(next) => { if (deleteLesson.isPending) return; setDeleteDialogOpen(next); }}
        >
          <AlertDialogContent className="rounded-xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
              <AlertDialogDescription>
                "{lesson.title || 'Untitled lesson'}" and everything attached to it —
                materials, assessments, and student progress — will be removed for
                everyone in this class. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteLesson.isPending} className="rounded-xl">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteLesson.isPending}
                onClick={(event) => { event.preventDefault(); void handleDelete(); }}
                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              >
                {deleteLesson.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
                ) : (
                  <><Trash2 className="h-4 w-4" /> Delete lesson</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add external link dialog */}
        <Dialog
          open={linkDialog.open}
          onOpenChange={(next) => { if (!next && !addingLink) setLinkDialog({ open: false }); }}
        >
          <DialogContent className="rounded-xl max-w-md">
            <DialogHeader>
              <DialogTitle>Add external link</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Students will see a card that opens the URL in a new tab. Useful for YouTube videos, articles, or Google Slides.
            </p>
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="link-title">Link title</Label>
                <Input
                  id="link-title"
                  placeholder="e.g. Watch: Introduction to Variables"
                  value={linkDialog.open ? linkDialog.title : ''}
                  onChange={(e) => linkDialog.open && setLinkDialog({ ...linkDialog, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link-url">URL</Label>
                <Input
                  id="link-url"
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={linkDialog.open ? linkDialog.url : ''}
                  onChange={(e) => linkDialog.open && setLinkDialog({ ...linkDialog, url: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={addingLink}
                  onClick={() => setLinkDialog({ open: false })}
                >
                  Cancel
                </Button>
                <Button
                  className="rounded-xl gap-1.5"
                  disabled={addingLink || !linkDialog.open || !linkDialog.title.trim() || !linkDialog.url.trim()}
                  onClick={() => void handleAddLink()}
                >
                  {addingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  Add link
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Template picker */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="rounded-xl max-w-lg">
            <DialogHeader>
              <DialogTitle>Apply a template</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-2">
              Pre-fills the description and completion rule. Your title and existing content are kept.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              {LESSON_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="flex flex-col gap-1.5 rounded-xl border p-4 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <span className="text-2xl">{tpl.icon}</span>
                  <span className="text-sm font-semibold">{tpl.name}</span>
                  <span className="text-xs text-muted-foreground leading-snug">{tpl.description}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
  );
}
