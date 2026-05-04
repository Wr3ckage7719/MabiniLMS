import { useMemo } from 'react';
import { Loader2, Eye, CheckCircle2, BookOpenCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLessonEngagement } from '@/hooks-api/useLessons';
import type {
  LessonEngagementCell,
  LessonEngagementLesson,
} from '@/services/lessons.service';

interface LessonViewsPanelProps {
  classId: string;
}

const initialsOf = (first: string | null, last: string | null, email: string): string => {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || 'U';
  return email.slice(0, 2).toUpperCase();
};

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (minutes >= 1) return `${minutes}m ago`;
  return 'Just now';
};

interface CellState {
  cell: LessonEngagementCell | null;
  lesson: LessonEngagementLesson;
}

function MatrixCell({ cell, lesson }: CellState) {
  if (!cell) {
    return (
      <div className="h-8 w-8 rounded-md border border-dashed border-border/60 bg-muted/30" />
    );
  }

  const tooltipBits: string[] = [lesson.title];
  if (cell.done && cell.marked_done_at) {
    tooltipBits.push(`Marked done ${formatRelative(cell.marked_done_at)}`);
  } else if (cell.opened) {
    tooltipBits.push(`Opened ${cell.view_count}× · last ${formatRelative(cell.last_viewed_at)}`);
  } else {
    tooltipBits.push('Not opened yet');
  }

  if (cell.done) {
    return (
      <div
        className="h-8 w-8 rounded-md bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700"
        title={tooltipBits.join(' · ')}
      >
        <CheckCircle2 className="h-4 w-4" />
      </div>
    );
  }

  if (cell.opened) {
    return (
      <div
        className="h-8 w-8 rounded-md bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-700"
        title={tooltipBits.join(' · ')}
      >
        <Eye className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div
      className="h-8 w-8 rounded-md bg-muted border border-border/60"
      title={tooltipBits.join(' · ')}
    />
  );
}

/**
 * Per-student × per-lesson engagement matrix. Each cell shows whether the
 * student opened the lesson (lesson_views) and/or marked it done
 * (lesson_progress). Powers the teacher's "who actually looked at this
 * lesson" view in the class insights tab.
 */
export function LessonViewsPanel({ classId }: LessonViewsPanelProps) {
  const { data, isLoading, error } = useLessonEngagement(classId);

  const cellMap = useMemo(() => {
    const map = new Map<string, LessonEngagementCell>();
    if (!data) return map;
    for (const cell of data.cells) {
      map.set(`${cell.lesson_id}:${cell.student_id}`, cell);
    }
    return map;
  }, [data]);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4" /> Lesson views
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Who has opened each lesson, and who has marked it done.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load lesson views.</p>
        ) : !data || data.lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No published lessons yet.
          </p>
        ) : data.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No students enrolled yet.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> Marked done
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-blue-100 border border-blue-300" /> Opened
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-muted border border-border/60" /> Not opened
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="text-left font-medium text-muted-foreground sticky left-0 bg-card pr-3 min-w-[180px]">
                      Student
                    </th>
                    {data.lessons.map((lesson) => (
                      <th
                        key={lesson.id}
                        className="font-medium text-muted-foreground px-1"
                        title={lesson.title}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-mono text-[10px]">
                            L{lesson.ordering.toString().padStart(2, '0')}
                          </span>
                          <span className="block max-w-[80px] truncate text-[10px] text-muted-foreground">
                            {lesson.title}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => {
                    const name =
                      `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() ||
                      student.email;
                    return (
                      <tr key={student.id}>
                        <td className="sticky left-0 bg-card pr-3 py-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 flex-shrink-0">
                              {student.avatar_url && (
                                <AvatarImage src={student.avatar_url} alt={name} />
                              )}
                              <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                                {initialsOf(student.first_name, student.last_name, student.email)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate max-w-[140px]">
                              {name}
                            </span>
                          </div>
                        </td>
                        {data.lessons.map((lesson) => {
                          const cell = cellMap.get(`${lesson.id}:${student.id}`) ?? null;
                          return (
                            <td key={lesson.id} className="p-0">
                              <div className="flex items-center justify-center">
                                <MatrixCell cell={cell} lesson={lesson} />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
