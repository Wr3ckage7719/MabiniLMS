import { AlertTriangle, Loader2, RefreshCw, Users, BookOpen, ClipboardList, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCourseInsights } from '@/hooks-api/useCourseInsights';

interface TeacherClassInsightsProps {
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

const initialsOf = (first: string | null, last: string | null, email: string): string => {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || 'U';
  return email.slice(0, 2).toUpperCase();
};

export function TeacherClassInsights({ classId }: TeacherClassInsightsProps) {
  const { data, isLoading, error, refetch, isFetching } = useCourseInsights(classId);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-sm text-destructive">Failed to load insights.</p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl gap-2"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const rollup = data.class_rollup;
  const maxBin = Math.max(1, ...rollup.grade_distribution.map((b) => b.count));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Class-level rollup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Students
            </div>
            <p className="text-2xl font-bold mt-1">{rollup.student_count}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-gradient-to-br from-accent/5 to-accent/0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" /> Assignments
            </div>
            <p className="text-2xl font-bold mt-1">{rollup.assignment_count}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" /> Avg completion
            </div>
            <p className="text-2xl font-bold mt-1">
              {rollup.avg_completion_percent.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
        <Card
          className={`border-0 shadow-sm ${
            rollup.at_risk_count > 0 ? 'bg-amber-50' : ''
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> At risk
            </div>
            <p
              className={`text-2xl font-bold mt-1 ${
                rollup.at_risk_count > 0 ? 'text-amber-700' : ''
              }`}
            >
              {rollup.at_risk_count}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Grade distribution */}
      {rollup.grade_distribution.some((b) => b.count > 0) && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Grade distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              {rollup.grade_distribution.map((bin) => (
                <div key={bin.range} className="flex flex-col items-center gap-2">
                  <div className="w-full h-24 bg-muted rounded flex items-end overflow-hidden">
                    <div
                      className="w-full bg-primary/70 transition-all"
                      style={{ height: `${(bin.count / maxBin) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{bin.range}</p>
                  <p className="text-xs font-semibold">{bin.count}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-student table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Per-student engagement</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {data.per_student.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No students enrolled yet.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {data.per_student.map((row) => {
                const name =
                  `${row.student.first_name ?? ''} ${row.student.last_name ?? ''}`.trim() ||
                  row.student.email;
                return (
                  <div
                    key={row.student.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      {row.student.avatar_url && (
                        <AvatarImage src={row.student.avatar_url} alt={name} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {initialsOf(row.student.first_name, row.student.last_name, row.student.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {row.at_risk && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] h-5 px-1.5">
                            <AlertTriangle className="h-3 w-3 mr-1" /> At risk
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {row.student.email} · last active {formatRelative(row.last_active_at)}
                      </p>
                    </div>
                    <div className="hidden sm:flex flex-col items-end text-[11px] text-muted-foreground gap-0.5 min-w-[140px]">
                      <span>
                        Submissions:{' '}
                        <span className="font-semibold text-foreground">
                          {row.submissions_total}/{rollup.assignment_count}
                        </span>{' '}
                        ({row.submissions_graded} graded)
                      </span>
                      <span>
                        Materials:{' '}
                        <span className="font-semibold text-foreground">
                          {row.materials_viewed}/{row.materials_total}
                        </span>
                      </span>
                      <span>
                        Avg grade:{' '}
                        <span className="font-semibold text-foreground">
                          {row.avg_grade_percent !== null
                            ? `${row.avg_grade_percent.toFixed(1)}%`
                            : '—'}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
