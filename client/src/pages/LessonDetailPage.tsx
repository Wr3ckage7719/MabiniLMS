import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  FileText,
  ClipboardList,
  Loader2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useStudentLesson, useStudentLessons, useMarkLessonAsDone } from '@/hooks-api/useLessons';
import { useClass } from '@/hooks-api/useClasses';
import type { Lesson, LessonAssessmentRef, LessonMaterialRef } from '@/lib/data';

const completionRuleCopy = (lesson: Lesson): string => {
  switch (lesson.completionRule.type) {
    case 'view_all_files':
      return 'Open every file at least once, then mark the lesson as done.';
    case 'time_on_material':
      return `Spend at least ${lesson.completionRule.min_minutes} minutes on the materials, then mark the lesson as done.`;
    case 'mark_as_done':
    default:
      return 'Read the materials, then mark the lesson as done.';
  }
};

const computeMarkDoneEligibility = (
  lesson: Lesson
): { canMark: boolean; reason: string | null } => {
  if (lesson.status === 'done') {
    return { canMark: false, reason: 'Already marked as done.' };
  }
  if (lesson.status === 'locked') {
    return { canMark: false, reason: 'Locked by chain.' };
  }
  switch (lesson.completionRule.type) {
    case 'view_all_files': {
      const hasFiles = lesson.materials.length > 0;
      if (!hasFiles) return { canMark: true, reason: null };
      const allViewed = lesson.materials.every((m) => m.viewed);
      return allViewed
        ? { canMark: true, reason: null }
        : { canMark: false, reason: 'Open every file at least once first.' };
    }
    case 'time_on_material': {
      const minSeconds = lesson.completionRule.min_minutes * 60;
      const totalSeconds = lesson.materials.reduce(
        (sum, m) => sum + (m.view_seconds ?? 0),
        0
      );
      return totalSeconds >= minSeconds
        ? { canMark: true, reason: null }
        : { canMark: false, reason: `Spend at least ${lesson.completionRule.min_minutes} minutes reading first.` };
    }
    case 'mark_as_done':
    default:
      return { canMark: true, reason: null };
  }
};

const fileIconLabel = (fileType: LessonMaterialRef['file_type']): string => {
  return fileType.toUpperCase();
};

interface AssessmentRowProps {
  assessment: LessonAssessmentRef;
  isLessonDone: boolean;
  onOpen: (assignmentId: string) => void;
}

function AssessmentRow({ assessment, isLessonDone, onOpen }: AssessmentRowProps) {
  const locked = !isLessonDone;
  const submitted = Boolean(assessment.submitted);
  const graded = Boolean(assessment.graded);

  const stateLabel = locked
    ? 'Locked'
    : graded
      ? `Graded · ${assessment.score_percent ?? 0}%`
      : submitted
        ? 'Submitted'
        : 'Take assessment';

  return (
    <Card
      className={`border ${locked ? 'opacity-70' : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all'}`}
      onClick={() => {
        if (!locked) onOpen(assessment.assignment_id);
      }}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex-shrink-0">
          {locked ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ClipboardList className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {assessment.raw_type}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
              {assessment.points} pts
            </Badge>
            {assessment.is_optional && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                Optional
              </Badge>
            )}
          </div>
          <p className="text-sm md:text-base font-medium mt-1 truncate">{assessment.title}</p>
          {locked ? (
            <p className="text-xs text-muted-foreground mt-1">
              Mark this lesson as done to unlock.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{stateLabel}</p>
          )}
        </div>
        {!locked && (
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
      </CardContent>
    </Card>
  );
}

interface MaterialRowProps {
  material: LessonMaterialRef;
  onOpen: (material: LessonMaterialRef) => void;
}

function MaterialRow({ material, onOpen }: MaterialRowProps) {
  return (
    <Card
      className="border cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
      onClick={() => onOpen(material)}
    >
      <CardContent className="p-4 flex items-center gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm md:text-base font-medium truncate">{material.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="uppercase">{fileIconLabel(material.file_type)}</span>
            {' · '}
            {material.file_size}
            {typeof material.page_count === 'number' && material.page_count > 0
              ? ` · ${material.page_count} ${material.page_count === 1 ? 'page' : 'pages'}`
              : ''}
            {material.viewed ? ' · viewed' : ''}
          </p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </CardContent>
    </Card>
  );
}

export default function LessonDetailPage() {
  const { id, lessonId } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const classQuery = useClass(classId);
  const lessonQuery = useStudentLesson(classId, lessonId);
  const allLessonsQuery = useStudentLessons(classId);
  const markDone = useMarkLessonAsDone(classId);
  const [pendingDone, setPendingDone] = useState(false);

  const lesson = lessonQuery.data ?? null;
  const allLessons = useMemo(() => allLessonsQuery.data ?? [], [allLessonsQuery.data]);

  const eligibility = useMemo(() => {
    if (!lesson) return { canMark: false, reason: null };
    return computeMarkDoneEligibility(lesson);
  }, [lesson]);

  const nextLesson = useMemo(() => {
    if (!lesson?.chain.next_lesson_id) return null;
    return allLessons.find((l) => l.id === lesson.chain.next_lesson_id) ?? null;
  }, [lesson, allLessons]);

  const handleBack = () => {
    navigate(`/class/${classId}`);
  };

  const handleOpenMaterial = (material: LessonMaterialRef) => {
    if (!material.url || material.url === '#') {
      toast({
        title: 'Material link unavailable',
        description: 'This material does not have a downloadable file yet.',
      });
      return;
    }
    navigate(`/class/${classId}/lessons/${lessonId}/materials/${material.material_id}`);
  };

  const handleOpenAssessment = (assignmentId: string) => {
    navigate(`/class/${classId}?assignmentId=${assignmentId}`);
  };

  const handleMarkDone = async () => {
    if (!lesson || !eligibility.canMark) return;
    setPendingDone(true);
    try {
      await markDone.mutateAsync(lesson.id);
      toast({
        title: 'Lesson marked as done',
        description: 'Your assessments are now unlocked.',
      });
    } catch (error) {
      toast({
        title: 'Could not mark lesson as done',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPendingDone(false);
    }
  };

  if (lessonQuery.isLoading || classQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading lesson…
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-3">
        <p className="text-lg font-semibold">Lesson not found</p>
        <p className="text-sm text-muted-foreground">
          This lesson may have been removed by your teacher.
        </p>
        <Button variant="outline" onClick={handleBack} className="rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to class
        </Button>
      </div>
    );
  }

  const isDone = lesson.status === 'done';
  const isLocked = lesson.status === 'locked';

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
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <span>{classQuery.data?.name}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            Lesson {lesson.ordering.toString().padStart(2, '0')}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <section>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isDone ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Done
              </Badge>
            ) : isLocked ? (
              <Badge variant="outline" className="bg-muted">
                <Lock className="h-3 w-3 mr-1" /> Locked
              </Badge>
            ) : (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">
                In progress
              </Badge>
            )}
            {lesson.topics.map((topic) => (
              <Badge
                key={topic}
                variant="outline"
                className="text-[10px] px-1.5 py-0.5 rounded-full border-primary/40 bg-primary/5 text-primary"
              >
                {topic}
              </Badge>
            ))}
          </div>

          <h1 className="mt-2 text-2xl md:text-3xl font-bold leading-tight">
            {lesson.title}
          </h1>
          {lesson.description && (
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              {lesson.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {completionRuleCopy(lesson)}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Materials
          </h2>
          {lesson.materials.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-5 text-center text-sm text-muted-foreground">
                No files attached. Mark as done to continue.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {lesson.materials.map((material) => (
                <MaterialRow
                  key={material.material_id}
                  material={material}
                  onOpen={handleOpenMaterial}
                />
              ))}
            </div>
          )}
        </section>

        <section className="sticky bottom-4 z-20">
          <Card className={`border-2 ${isDone ? 'border-emerald-400 bg-emerald-50' : 'border-primary/30 bg-card'}`}>
            <CardContent className="p-4 md:p-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {isDone ? 'Lesson completed' : 'Ready to continue?'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isDone
                    ? 'Your assessments below are unlocked.'
                    : eligibility.reason ?? 'Mark this lesson as done to unlock the assessments.'}
                </p>
              </div>
              <Button
                size="lg"
                disabled={!eligibility.canMark || pendingDone || isDone}
                onClick={handleMarkDone}
                className="rounded-xl flex-shrink-0"
              >
                {isDone ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Done
                  </>
                ) : pendingDone ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…
                  </>
                ) : (
                  'Mark lesson as done'
                )}
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Assessments {isDone ? '' : '(unlock after marking as done)'}
          </h2>
          {lesson.assessments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-5 text-center text-sm text-muted-foreground">
                This lesson has no assessments. Mark as done to advance.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {lesson.assessments.map((assessment) => (
                <AssessmentRow
                  key={assessment.assignment_id}
                  assessment={assessment}
                  isLessonDone={isDone}
                  onOpen={handleOpenAssessment}
                />
              ))}
            </div>
          )}
        </section>

        {nextLesson && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Next up
            </h2>
            <Card
              className={`border ${nextLesson.status === 'locked' ? 'opacity-70' : 'cursor-pointer hover:shadow-md transition-all'}`}
              onClick={() => {
                if (nextLesson.status !== 'locked') {
                  navigate(`/class/${classId}/lessons/${nextLesson.id}`);
                }
              }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                  Lesson {nextLesson.ordering.toString().padStart(2, '0')}
                </span>
                <p className="text-sm font-medium flex-1 truncate">{nextLesson.title}</p>
                {nextLesson.status === 'locked' ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
