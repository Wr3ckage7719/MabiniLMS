import { CheckCircle2, Loader2, Lock, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssessmentReadiness } from '@/hooks-api/useTeacherEngagement';

interface AssessmentReadinessPanelProps {
  assignmentId: string;
}

const initialsOf = (
  first: string | null,
  last: string | null,
  email: string
): string => {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || 'U';
  return email.slice(0, 2).toUpperCase();
};

/**
 * Per-assessment readiness rollup for teachers. Shows which enrolled
 * students have completed the required learning materials and which are
 * still blocked. Refreshes off the same lock-state path students see, so
 * teacher and student views always agree on what's missing.
 */
export function AssessmentReadinessPanel({
  assignmentId,
}: AssessmentReadinessPanelProps) {
  const { data, isLoading, error } = useAssessmentReadiness(assignmentId);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" /> Student readiness
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Which students can take this assessment now, based on the required
          learning materials.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Failed to load readiness.</p>
        ) : !data ? null : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full">
                {data.gating_enabled ? 'Gate ON' : 'Gate OFF'}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {data.required_count} required materials
              </Badge>
              <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0">
                {data.ready_count} ready
              </Badge>
              <Badge className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">
                {data.not_ready_count} blocked
              </Badge>
            </div>

            {data.students.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No students enrolled yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.students.map((row) => (
                  <li
                    key={row.student.id}
                    className="flex items-center gap-3 rounded-lg border bg-secondary/20 p-2"
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      {row.student.avatar_url ? (
                        <AvatarImage src={row.student.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {initialsOf(
                          row.student.first_name,
                          row.student.last_name,
                          row.student.email
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(row.student.first_name || '') +
                          ' ' +
                          (row.student.last_name || '') ||
                          row.student.email}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {row.student.email}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {row.ready ? (
                        <Badge className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Ready
                        </Badge>
                      ) : (
                        <Badge className="rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0 gap-1">
                          <Lock className="h-3 w-3" /> Locked
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {row.satisfied_count}/{row.required_count}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
