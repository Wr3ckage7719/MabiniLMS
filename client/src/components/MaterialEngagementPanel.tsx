import { Loader2, BookOpen, Download, Eye, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useCourseMaterialEngagement } from '@/hooks-api/useTeacherEngagement';

interface MaterialEngagementPanelProps {
  classId: string;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return 'No activity yet';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'No activity yet';
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (minutes >= 1) return `${minutes}m ago`;
  return 'Just now';
};

/**
 * Per-material engagement rollup for a single class. Surfaces the
 * material_progress telemetry that has been collected for some time but
 * never made it onto a teacher screen: started, completed, avg progress,
 * downloads, last activity.
 */
export function MaterialEngagementPanel({ classId }: MaterialEngagementPanelProps) {
  const { data, isLoading, error } = useCourseMaterialEngagement(classId);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Learning material engagement
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          How students are progressing through the materials in this class.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            Failed to load material engagement.
          </p>
        ) : !data || data.materials.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No materials uploaded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.materials.map((m) => {
              const startedPct =
                m.enrolled_students > 0
                  ? (m.students_started / m.enrolled_students) * 100
                  : 0;
              const completedPct =
                m.enrolled_students > 0
                  ? (m.students_completed / m.enrolled_students) * 100
                  : 0;

              return (
                <li
                  key={m.material_id}
                  className="rounded-lg border bg-secondary/20 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.material_title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Last activity: {formatRelative(m.last_activity_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end text-[11px] text-muted-foreground gap-0.5">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {m.students_started}/{m.enrolled_students} started
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {m.students_completed}/{m.enrolled_students} completed
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        {m.total_downloads} downloads
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Started</span>
                      <span>{Math.round(startedPct)}%</span>
                    </div>
                    <Progress value={startedPct} className="h-1.5" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Completed</span>
                      <span>{Math.round(completedPct)}%</span>
                    </div>
                    <Progress value={completedPct} className="h-1.5" />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Avg progress</span>
                      <span>{Math.round(m.avg_progress_percent)}%</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
