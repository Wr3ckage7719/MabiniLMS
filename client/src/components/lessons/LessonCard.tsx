import { Lock, Play, CheckCircle2, FileText, ClipboardList, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Lesson, LessonStatus, LessonUnlockBlocker } from '@/lib/data';

const STATUS_PILL: Record<LessonStatus, { label: string; className: string }> = {
  done: {
    label: 'Done',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  active: {
    label: 'In progress',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  locked: {
    label: 'Locked',
    className: 'bg-muted text-muted-foreground border-border',
  },
  draft: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
};

const blockerCopy = (blocker: LessonUnlockBlocker | null | undefined): string => {
  if (!blocker) return 'Locked — finish the previous lesson first.';
  switch (blocker.reason) {
    case 'predecessor_not_done':
      return `Locked — finish "${blocker.lesson_title}" first.`;
    case 'predecessor_assessment_pending':
      return `Locked — submit the assessment for "${blocker.lesson_title}".`;
    case 'predecessor_assessment_failed':
      return `Locked — pass the assessment for "${blocker.lesson_title}".`;
    default:
      return `Locked — finish "${blocker.lesson_title}" first.`;
  }
};

const formatOrdering = (ordering: number): string => {
  return ordering.toString().padStart(2, '0');
};

const computeBestScore = (lesson: Lesson): number | null => {
  const graded = lesson.assessments.filter((a) => a.graded && typeof a.score_percent === 'number');
  if (graded.length === 0) return null;
  return Math.round(
    graded.reduce((sum, a) => sum + (a.score_percent ?? 0), 0) / graded.length
  );
};

interface LessonCardProps {
  lesson: Lesson;
  onOpen: (lessonId: string) => void;
}

export function LessonCard({ lesson, onOpen }: LessonCardProps) {
  const pill = STATUS_PILL[lesson.status];
  const isLocked = lesson.status === 'locked';
  const isDone = lesson.status === 'done';
  const fileCount = lesson.materials.length;
  const assessmentCount = lesson.assessments.length;
  const bestScore = computeBestScore(lesson);

  const cardClasses = `border shadow-sm transition-all ${
    isLocked
      ? 'opacity-70 hover:opacity-90 cursor-not-allowed'
      : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'
  }`;

  const statusIcon = isDone ? (
    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
  ) : isLocked ? (
    <Lock className="h-5 w-5 text-muted-foreground" />
  ) : (
    <Play className="h-5 w-5 text-primary" />
  );

  const handleClick = () => {
    if (!isLocked) {
      onOpen(lesson.id);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (isLocked) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(lesson.id);
    }
  };

  return (
    <Card
      className={cardClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={isLocked ? -1 : 0}
      role={isLocked ? undefined : 'button'}
      aria-label={`Lesson ${formatOrdering(lesson.ordering)}: ${lesson.title}${isLocked ? ' (locked)' : ''}`}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="mt-0.5 flex-shrink-0">{statusIcon}</div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase tracking-wide">
                Lesson {formatOrdering(lesson.ordering)}
              </span>
              <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 ${pill.className}`}>
                {pill.label}
              </Badge>
              {bestScore !== null && (
                <span className="text-emerald-600 font-medium">{bestScore}%</span>
              )}
            </div>

            <h3 className="text-base md:text-lg font-semibold mt-1 leading-snug truncate">
              {lesson.title}
            </h3>

            {lesson.description && !isLocked && (
              <p className="text-xs md:text-sm text-muted-foreground mt-1 line-clamp-2">
                {lesson.description}
              </p>
            )}

            {isLocked && (
              <p className="text-xs md:text-sm text-muted-foreground mt-1.5">
                {blockerCopy(lesson.unlockBlocker)}
              </p>
            )}

            {!isLocked && (
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {fileCount} file
                  {fileCount === 1 ? '' : 's'}
                </span>
                {assessmentCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" /> {assessmentCount} assessment
                    {assessmentCount === 1 ? '' : 's'}
                  </span>
                )}
                {lesson.topics.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    {lesson.topics.slice(0, 2).map((topic) => (
                      <span
                        key={topic}
                        className="px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/5 text-primary text-[10px]"
                      >
                        {topic}
                      </span>
                    ))}
                    {lesson.topics.length > 2 && (
                      <span className="text-[10px]">+{lesson.topics.length - 2}</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {!isLocked && (
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 self-center" aria-hidden />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LessonCard;
