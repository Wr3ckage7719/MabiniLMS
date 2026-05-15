import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getClassHomePath } from '@/lib/navigation';
import { extractApiErrorMessage } from '@/lib/api-errors';
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  FileText,
  ClipboardList,
  Loader2,
  ChevronRight,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useStudentLesson,
  useStudentLessons,
  useMarkLessonAsDone,
  useTrackLessonView,
} from '@/hooks-api/useLessons';
import { useClass } from '@/hooks-api/useClasses';
import { useAssignment } from '@/hooks-api/useAssignments';
import type { Assignment, Lesson, LessonAssessmentRef, LessonMaterialRef } from '@/lib/data';
import { AssignmentDetailDialog } from '@/components/AssignmentDetailDialog';
import { downloadMaterialWithTracking } from '@/lib/material-actions';

const ProctoredExamDialog = lazy(() =>
  import('@/components/ProctoredExamDialog').then((m) => ({ default: m.ProctoredExamDialog }))
);

const completionRuleCopy = (lesson: Lesson): string => {
  if (lesson.materials.length === 0) {
    return 'Mark this lesson as done to unlock the assessments.';
  }
  if (lesson.completionRule.type === 'time_on_material') {
    return `Open every file and spend at least ${lesson.completionRule.min_minutes} minutes reading, then mark the lesson as done.`;
  }
  if (lesson.completionRule.type === 'view_all_and_submit') {
    return 'Open every file and submit each required assessment below, then mark the lesson as done.';
  }
  return 'Open every file at least once, then mark the lesson as done.';
};

// Returns true when the lesson's completion rule says assessments must be
// taken BEFORE the lesson is marked as done (i.e. view_all_and_submit).
// AssessmentRow uses this to decide whether to lock the row purely on
// lesson-done state, which would otherwise create a catch-22: the student
// can't mark the lesson done until they submit, and can't submit because
// the UI locks the assessment.
const assessmentsUnlockedBeforeDone = (lesson: Lesson | null | undefined): boolean => {
  return lesson?.completionRule.type === 'view_all_and_submit';
};

// Regardless of the teacher-set completion rule, students must open every
// attached material before they can mark a lesson as done. The assessment
// gate downstream relies on this: a student should not be able to skip the
// reading and jump straight to the quiz/exam.
const computeMarkDoneEligibility = (
  lesson: Lesson
): { canMark: boolean; reason: string | null } => {
  if (lesson.status === 'done') {
    return { canMark: false, reason: 'Already marked as done.' };
  }
  if (lesson.status === 'locked') {
    return { canMark: false, reason: 'Locked by chain.' };
  }

  // The server only enforces material-viewing on non-optional materials. The
  // client check used to require every material (including optional) which
  // diverged from server policy. Aligning the two prevents the button from
  // looking enabled-then-rejected when only optional materials are unread.
  const requiredMaterials = lesson.materials.filter((m) => !m.is_optional);
  if (requiredMaterials.length > 0) {
    const allRequiredViewed = requiredMaterials.every((m) => m.viewed);
    if (!allRequiredViewed) {
      return { canMark: false, reason: 'Open every required file at least once first.' };
    }
  }

  if (lesson.completionRule.type === 'time_on_material') {
    const minSeconds = lesson.completionRule.min_minutes * 60;
    const totalSeconds = lesson.materials.reduce(
      (sum, m) => sum + (m.view_seconds ?? 0),
      0
    );
    if (totalSeconds < minSeconds) {
      return {
        canMark: false,
        reason: `Spend at least ${lesson.completionRule.min_minutes} minutes reading first.`,
      };
    }
  }

  // `view_all_and_submit` lessons require every required assessment to be
  // submitted BEFORE the lesson can be marked done. The server enforces this
  // and used to 403 even though the client allowed the click — match the
  // server check here so the button reflects reality.
  if (lesson.completionRule.type === 'view_all_and_submit') {
    const requiredAssessments = lesson.assessments.filter((a) => !a.is_optional);
    if (requiredAssessments.length > 0) {
      const allSubmitted = requiredAssessments.every((a) => Boolean(a.submitted));
      if (!allSubmitted) {
        return {
          canMark: false,
          reason: 'Submit every required assessment below before marking the lesson as done.',
        };
      }
    }
  }

  return { canMark: true, reason: null };
};

const fileIconLabel = (fileType: LessonMaterialRef['file_type']): string => {
  return fileType.toUpperCase();
};

interface AssessmentRowProps {
  assessment: LessonAssessmentRef;
  isLessonDone: boolean;
  // When the lesson's rule is `view_all_and_submit`, assessments must be
  // taken before the lesson can be marked done. Forcing `locked = !isLessonDone`
  // in that case is the source of the historical catch-22 (server requires
  // submission to mark done; UI requires done to submit). The parent computes
  // this from `lesson.completionRule.type` and passes it in.
  lessonAllowsEarlySubmit: boolean;
  onOpen: (assignmentId: string) => void;
}

function AssessmentRow({ assessment, isLessonDone, lessonAllowsEarlySubmit, onOpen }: AssessmentRowProps) {
  const locked = !isLessonDone && !lessonAllowsEarlySubmit;
  const submitted = Boolean(assessment.submitted);
  const graded = Boolean(assessment.graded);

  const stateLabel = locked
    ? 'Locked'
    : graded
      ? `Graded · ${assessment.score_percent ?? 0}%`
      : submitted
        ? 'Submitted'
        : 'Take assessment';

  let statusBadge: React.ReactNode = null;
  if (locked) {
    statusBadge = (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] flex-shrink-0 gap-1">
        <Lock className="h-3 w-3" /> Locked
      </Badge>
    );
  } else if (graded) {
    statusBadge = (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border flex-shrink-0 gap-1">
        <CheckCircle2 className="h-3 w-3" /> {assessment.score_percent ?? 0}%
      </Badge>
    );
  } else if (submitted) {
    statusBadge = (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border flex-shrink-0 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Submitted
      </Badge>
    );
  } else {
    statusBadge = (
      <Badge className="bg-primary text-primary-foreground border-primary border flex-shrink-0">
        Start
      </Badge>
    );
  }

  return (
    <Card
      className={`border ${locked ? 'opacity-70' : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all'}`}
      onClick={() => {
        if (!locked) onOpen(assessment.assignment_id);
      }}
    >
      <CardContent className="p-3 md:p-4 flex items-center gap-3 min-h-14">
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
          <p className="text-sm md:text-base font-medium mt-1 line-clamp-2 md:truncate break-words">{assessment.title}</p>
          {locked && (
            <p className="text-xs text-muted-foreground mt-1">
              Mark this lesson as done to unlock.
            </p>
          )}
          {!locked && (graded || submitted) && (
            <p className="text-xs text-muted-foreground mt-1 md:hidden">{stateLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusBadge}
          {!locked && <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 hidden md:block" />}
        </div>
      </CardContent>
    </Card>
  );
}

interface MaterialRowProps {
  material: LessonMaterialRef;
  onOpen: (material: LessonMaterialRef) => void;
}

function MaterialRow({ material, onOpen }: MaterialRowProps) {
  const viewed = Boolean(material.viewed);
  const locked = Boolean(material.locked) && !viewed;
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const cooldownRef = useRef<number | null>(null);

  const handleDownload = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (locked || downloading) return;
    if (cooldownRef.current && Date.now() < cooldownRef.current) return;
    if (!material.url || material.url === '#') {
      toast({
        title: 'Download unavailable',
        description: 'This material has no downloadable file.',
        variant: 'destructive',
      });
      return;
    }
    setDownloading(true);
    cooldownRef.current = Date.now() + 2000;
    const fired = downloadMaterialWithTracking({
      id: material.material_id,
      title: material.title,
      url: material.url,
    });
    if (fired) {
      toast({ title: 'Download started', description: 'Your file is being saved.' });
    } else {
      setDownloading(false);
      return;
    }
    window.setTimeout(() => setDownloading(false), 2000);
  };

  const statusBadge = viewed ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border flex-shrink-0">
      <CheckCircle2 className="h-3 w-3 mr-1" /> Read
    </Badge>
  ) : locked ? (
    <Badge variant="outline" className="text-[10px] flex-shrink-0">
      Locked
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] flex-shrink-0">
      Tap to open
    </Badge>
  );

  return (
    <Card
      className={`border ${locked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all'}`}
      onClick={() => {
        if (locked) {
          toast({
            title: 'Locked',
            description: 'Finish the previous reading material first.',
          });
          return;
        }
        onOpen(material);
      }}
    >
      {/* Mobile layout: two rows for better readability */}
      <CardContent className="p-3 md:hidden">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 p-2 rounded-lg ${locked ? 'bg-muted' : 'bg-primary/10'}`}>
            {locked ? (
              <Lock className="h-5 w-5 text-muted-foreground" />
            ) : (
              <FileText className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug break-words line-clamp-2">{material.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="uppercase">{fileIconLabel(material.file_type)}</span>
              {' · '}
              {material.file_size}
              {typeof material.page_count === 'number' && material.page_count > 0
                ? ` · ${material.page_count} ${material.page_count === 1 ? 'page' : 'pages'}`
                : ''}
            </p>
            {locked && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Finish the previous file first.
              </p>
            )}
          </div>
          {statusBadge}
        </div>
        <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-9 px-3 text-xs gap-1.5"
            onClick={handleDownload}
            disabled={locked || downloading || !material.url || material.url === '#'}
            aria-label={`Download ${material.title}`}
            title="Download file"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span>Download</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg h-9 px-3 text-xs gap-1 pointer-events-none"
            tabIndex={-1}
            aria-hidden
          >
            <span>Open</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      {/* Desktop layout: original single-row layout */}
      <CardContent className="p-4 hidden md:flex items-center gap-3">
        <div className={`flex-shrink-0 p-2 rounded-lg ${locked ? 'bg-muted' : 'bg-primary/10'}`}>
          {locked ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <FileText className="h-5 w-5 text-primary" />
          )}
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
          </p>
          {locked && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Finish the previous file first.
            </p>
          )}
        </div>
        {statusBadge}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl flex-shrink-0 h-8 w-8"
          onClick={handleDownload}
          disabled={locked || downloading || !material.url || material.url === '#'}
          aria-label={`Download ${material.title}`}
          title="Download file"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </CardContent>
    </Card>
  );
}

export default function LessonDetailPage() {
  const { id, lessonId } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [examAssignment, setExamAssignment] = useState<Assignment | null>(null);

  const classQuery = useClass(classId);
  const assignmentQuery = useAssignment(classId, selectedAssignmentId ?? '');
  const lessonQuery = useStudentLesson(classId, lessonId);
  const allLessonsQuery = useStudentLessons(classId);
  const markDone = useMarkLessonAsDone(classId);
  const trackView = useTrackLessonView();
  const [pendingDone, setPendingDone] = useState(false);

  const lesson = lessonQuery.data ?? null;

  // Record this lesson open exactly once per (classId, lessonId) mount. The
  // server endpoint is idempotent and no-ops for teachers; this guard just
  // avoids a redundant network round-trip when React strict-mode double-renders.
  const trackedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!classId || !lessonId) return;
    const key = `${classId}:${lessonId}`;
    if (trackedKeyRef.current === key) return;
    trackedKeyRef.current = key;
    trackView.mutate({ classId, lessonId });
    // trackView identity is stable across renders; we don't need it in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, lessonId]);
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
    navigate(getClassHomePath(user?.role, classId));
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
    setSelectedAssignmentId(assignmentId);
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
      // Surface the server-side reason ("Submit all required assessments…",
      // "Open every required file…", etc.) instead of the bare Axios
      // "Request failed with status code 403" the user used to see.
      toast({
        title: 'Could not mark lesson as done',
        description: extractApiErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPendingDone(false);
    }
  };

  if (lessonQuery.isLoading || classQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="h-8 w-32 rounded-md bg-muted animate-pulse" />
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <div className="space-y-3">
            <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-8 w-3/4 rounded-md bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 w-full rounded-lg border bg-card animate-pulse" />
            ))}
          </div>
        </main>
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
  const lessonAllowsEarlySubmit = assessmentsUnlockedBeforeDone(lesson);
  const viewedMaterialCount = lesson.materials.filter((m) => m.viewed).length;
  const totalMaterialCount = lesson.materials.length;
  const canGoToNext = isDone && nextLesson && nextLesson.status !== 'locked';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="max-w-3xl mx-auto px-3 md:px-6 py-2 md:py-3 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="rounded-xl gap-1.5 min-h-11 md:min-h-9 px-3 md:px-3"
          >
            <ArrowLeft className="h-5 w-5 md:h-4 md:w-4" />
            <span className="md:inline">
              <span className="md:hidden">Back</span>
              <span className="hidden md:inline">Back to lessons</span>
            </span>
          </Button>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
            <span>{classQuery.data?.name}</span>
          </div>
          <div className="text-sm md:text-xs text-muted-foreground font-mono">
            Lesson {lesson.ordering.toString().padStart(2, '0')}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-8 pb-24 md:pb-8 space-y-5 md:space-y-6">
        <section>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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

          <h1 className="mt-2 text-xl md:text-3xl font-bold leading-tight break-words">
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
          <h2 className="text-base md:text-sm font-semibold text-foreground md:text-muted-foreground md:uppercase md:tracking-wide flex items-center gap-2">
            <span className="block h-4 w-1 rounded-full bg-primary md:hidden" aria-hidden />
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

        <section className="hidden md:block sticky bottom-4 z-20">
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
          <h2 className="text-base md:text-sm font-semibold text-foreground md:text-muted-foreground md:uppercase md:tracking-wide flex items-center gap-2">
            <span className="block h-4 w-1 rounded-full bg-primary md:hidden" aria-hidden />
            Assessments {isDone ? '' : (
              <span className="font-normal text-muted-foreground text-xs md:text-sm">
                {lessonAllowsEarlySubmit
                  ? '(submit each to mark this lesson done)'
                  : '(unlock after marking as done)'}
              </span>
            )}
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
                  lessonAllowsEarlySubmit={lessonAllowsEarlySubmit}
                  onOpen={handleOpenAssessment}
                />
              ))}
            </div>
          )}
        </section>

        {nextLesson && (
          <section>
            <h2 className="text-base md:text-sm font-semibold text-foreground md:text-muted-foreground md:uppercase md:tracking-wide mb-2 flex items-center gap-2">
              <span className="block h-4 w-1 rounded-full bg-primary md:hidden" aria-hidden />
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

      {/* Mobile-only fixed bottom action bar for primary CTA */}
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur supports-[backdrop-filter]:bg-background/80 bg-background/95 pb-[env(safe-area-inset-bottom)] ${
          isDone ? 'border-emerald-300/70' : 'border-border'
        }`}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight">
              {isDone
                ? 'Lesson completed'
                : totalMaterialCount > 0
                  ? `${viewedMaterialCount} of ${totalMaterialCount} ${totalMaterialCount === 1 ? 'material' : 'materials'} viewed`
                  : 'Ready to continue?'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
              {isDone
                ? canGoToNext
                  ? 'Continue to the next lesson.'
                  : 'Your assessments are unlocked.'
                : eligibility.reason ?? 'Mark as done to unlock assessments.'}
            </p>
          </div>
          {isDone && canGoToNext ? (
            <Button
              size="sm"
              className="rounded-xl flex-shrink-0 min-h-11 px-4"
              onClick={() => navigate(`/class/${classId}/lessons/${nextLesson!.id}`)}
            >
              Next lesson <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!eligibility.canMark || pendingDone || isDone}
              onClick={handleMarkDone}
              className="rounded-xl flex-shrink-0 min-h-11 px-4"
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
                'Mark as done'
              )}
            </Button>
          )}
        </div>
      </div>

      <AssignmentDetailDialog
        assignment={assignmentQuery.data ?? null}
        open={!!assignmentQuery.data}
        onOpenChange={(open) => {
          if (!open) setSelectedAssignmentId(null);
        }}
        teacherName={classQuery.data?.teacher ?? ''}
        classId={classId}
        onStartExam={(assignment) => {
          setExamAssignment(assignment);
          setSelectedAssignmentId(null);
        }}
      />

      {examAssignment && (examAssignment.rawType === 'quiz' || examAssignment.rawType === 'exam') && (
        <Suspense fallback={null}>
          <ProctoredExamDialog
            assignmentId={examAssignment.id}
            assignmentTitle={examAssignment.title}
            open={!!examAssignment}
            onOpenChange={(open) => {
              if (!open) setExamAssignment(null);
            }}
            mode={examAssignment.rawType === 'quiz' ? 'quiz' : 'exam'}
          />
        </Suspense>
      )}
    </div>
  );
}
