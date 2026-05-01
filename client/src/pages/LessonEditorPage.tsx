import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useTeacherLesson,
  useTeacherLessons,
  useUpdateLesson,
  useDeleteLesson,
} from '@/hooks-api/useLessons';
import { useClass } from '@/hooks-api/useClasses';
import {
  CreateAssignmentDialog,
  type TaskType,
} from '@/components/CreateAssignmentDialog';
import { MaterialPreviewDialog } from '@/components/MaterialPreviewDialog';
import { materialsService } from '@/services/materials.service';
import { assignmentsService } from '@/services/assignments.service';
import type {
  LearningMaterial,
  Lesson,
  LessonChain,
  LessonCompletionRule,
  LessonAssessmentRef,
  LessonMaterialRef,
} from '@/lib/data';

type CompletionRuleType = LessonCompletionRule['type'];

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
  return { type: 'mark_as_done' };
};

const chainFromDraft = (draft: DraftState): LessonChain => ({
  next_lesson_id: draft.chainNextId === '__none__' ? null : draft.chainNextId,
  unlock_on_submit: draft.unlockOnSubmit,
  unlock_on_pass: draft.unlockOnPass,
  pass_threshold_percent: draft.unlockOnPass ? draft.passThreshold : null,
});

interface MaterialChipProps {
  material: LessonMaterialRef;
  onPreview: () => void;
  onRemove: () => void;
  removing: boolean;
}

function MaterialChip({ material, onPreview, onRemove, removing }: MaterialChipProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-secondary/40">
      <button
        type="button"
        onClick={onPreview}
        className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
        aria-label={`Preview ${material.title}`}
      >
        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{material.title}</p>
          <p className="text-xs text-muted-foreground">
            <span className="uppercase">{material.file_type}</span> · {material.file_size}
          </p>
        </div>
      </button>
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
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-secondary/40">
      <Icon className="h-4 w-4 text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{assessment.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className="uppercase">{assessment.raw_type}</span>
          <span>·</span>
          <span>{assessment.points} pts</span>
          {assessment.is_optional ? (
            <>
              <span>·</span>
              <span className="italic">optional</span>
            </>
          ) : null}
        </div>
      </div>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [builderTaskType, setBuilderTaskType] = useState<TaskType | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<LessonMaterialRef | null>(null);
  const [removingMaterialId, setRemovingMaterialId] = useState<string | null>(null);
  const [removingAssessmentId, setRemovingAssessmentId] = useState<string | null>(null);

  useEffect(() => {
    if (lesson && !draft) {
      setDraft(buildDraftFromLesson(lesson));
    }
  }, [lesson, draft]);

  const otherLessons = useMemo(() => {
    if (!lesson) return allLessons;
    return allLessons.filter((other) => other.id !== lesson.id);
  }, [allLessons, lesson]);

  const handleBack = () => navigate(`/class/${classId}?tab=lessons`);

  const refreshLesson = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lessons', 'teacher', classId] }),
      queryClient.invalidateQueries({ queryKey: ['lessons', 'student', classId] }),
    ]);
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

  const persist = async (publish: boolean) => {
    if (!draft || !lesson) return;
    if (publish && draft.title.trim().length === 0) {
      toast({
        title: 'Title required',
        description: 'Add a lesson title before publishing.',
        variant: 'destructive',
      });
      return;
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
      toast({
        title: publish ? 'Lesson published' : 'Draft saved',
        description: publish
          ? 'Students can now see this lesson.'
          : 'Your changes are saved. Publish when you are ready.',
      });
      handleBack();
    } catch (error) {
      toast({
        title: 'Could not save lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!lesson) return;
    try {
      await deleteLesson.mutateAsync(lesson.id);
      toast({ title: 'Lesson deleted' });
      handleBack();
    } catch (error) {
      toast({
        title: 'Could not delete lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (lessonQuery.isLoading || classQuery.isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading lesson editor…
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="rounded-xl gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Back to lessons
          </Button>
          <div className="hidden md:block text-xs text-muted-foreground">
            {classQuery.data?.name}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Lesson {lesson.ordering.toString().padStart(2, '0')}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 pb-32">
        <section>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {lesson.isPublished ? 'Edit lesson' : 'New lesson'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lessons are the core of the new flow. Files and assessments belong to a
            lesson; the next lesson stays locked until this one is done.
          </p>
        </section>

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title">Title</Label>
              <Input
                id="lesson-title"
                value={draft.title}
                onChange={(event) => update({ title: event.target.value })}
                placeholder="e.g. Power Supply Units"
              />
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
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Materials</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PDF, DOCX, PPTX, images, or video. Students view in-app with reading
                  progress tracked.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setBuilderTaskType('reading_material')}
              >
                <BookOpen className="h-3.5 w-3.5" /> Add reading material
              </Button>
            </div>

            {lesson.materials.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No materials yet. Click <em>Add reading material</em> to upload a file
                students can view, scroll, and have their progress tracked on.
              </div>
            ) : (
              <div className="space-y-2">
                {lesson.materials.map((material) => (
                  <MaterialChip
                    key={material.material_id}
                    material={material}
                    onPreview={() => setPreviewMaterial(material)}
                    onRemove={() => void handleRemoveMaterial(material.material_id, material.title)}
                    removing={removingMaterialId === material.material_id}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Completion rule</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                What lets the student press <em>Mark as done</em>.
              </p>
            </div>

            <div className="space-y-2">
              {(
                [
                  { id: 'mark_as_done', label: 'Student presses Mark as done' },
                  { id: 'view_all_files', label: 'Reach end of all materials' },
                  { id: 'time_on_material', label: 'Time on material ≥ N minutes' },
                ] as { id: CompletionRuleType; label: string }[]
              ).map((option) => (
                <label
                  key={option.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    draft.ruleType === option.id ? 'border-primary bg-primary/5' : 'hover:bg-secondary/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="completion-rule"
                    value={option.id}
                    checked={draft.ruleType === option.id}
                    onChange={() => update({ ruleType: option.id })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">{option.label}</span>
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
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold">Assessments</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unlock after the student marks this lesson as done.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setBuilderTaskType('activity')}
              >
                <Activity className="h-3.5 w-3.5" /> Add activity
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setBuilderTaskType('quiz')}
              >
                <FileText className="h-3.5 w-3.5" /> Add quiz
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setBuilderTaskType('exam')}
              >
                <ClipboardCheck className="h-3.5 w-3.5" /> Add exam
              </Button>
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

        <Card className="border shadow-sm">
          <CardContent className="p-5 md:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <LinkIcon className="h-4 w-4" /> Chain
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                What the student unlocks after finishing this lesson and its assessments.
              </p>
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

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-5 md:p-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
              <p className="text-xs text-destructive/80 mt-0.5">
                Deleting a lesson removes its files and assessments for everyone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl gap-1.5 flex-shrink-0"
              onClick={() => {
                if (confirmingDelete) {
                  void handleDelete();
                } else {
                  setConfirmingDelete(true);
                  setTimeout(() => setConfirmingDelete(false), 4000);
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingDelete ? 'Confirm delete' : 'Delete lesson'}
            </Button>
          </CardContent>
        </Card>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <Badge variant="outline" className={lesson.isPublished ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
              {lesson.isPublished ? 'Published' : 'Draft'}
            </Badge>
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
            <Button
              className="rounded-xl gap-1.5"
              disabled={saving}
              onClick={() => void persist(true)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Publish lesson
            </Button>
          </div>
        </div>
      </footer>

      <CreateAssignmentDialog
        open={builderTaskType !== null}
        onOpenChange={(next) => {
          if (!next) setBuilderTaskType(null);
        }}
        classId={classId}
        lessonId={lesson.id}
        initialTaskType={builderTaskType ?? undefined}
        onCreated={() => {
          setBuilderTaskType(null);
          void refreshLesson();
        }}
      />

      <MaterialPreviewDialog
        open={previewMaterial !== null}
        material={previewMaterial ? toPreviewMaterial(previewMaterial, classId) : null}
        onOpenChange={(next) => {
          if (!next) setPreviewMaterial(null);
        }}
        isTeacher
        courseId={classId}
      />
    </div>
  );
}
