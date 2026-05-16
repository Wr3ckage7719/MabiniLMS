import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  BookOpen,
  Download,
  Eye,
  CheckCircle2,
  Circle,
  Clock,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMaterialStudentEngagement } from '@/hooks-api/useTeacherEngagement';
import type { MaterialStudentEngagementRow } from '@/services/teacher-engagement.service';
import { formatDurationSeconds } from '@/lib/duration';

type SortKey = 'name' | 'progress_desc' | 'progress_asc' | 'last_activity' | 'time_desc';

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

const displayName = (row: MaterialStudentEngagementRow): string => {
  const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
  return name || row.email;
};

const initials = (row: MaterialStudentEngagementRow): string => {
  const first = (row.first_name ?? '').charAt(0);
  const last = (row.last_name ?? '').charAt(0);
  const fallback = (row.email ?? '?').charAt(0);
  return `${first}${last}`.toUpperCase() || fallback.toUpperCase();
};

export default function MaterialEngagementDetailPage() {
  const navigate = useNavigate();
  const { classId, materialId } = useParams<{ classId: string; materialId: string }>();
  const { data, isLoading, error } = useMaterialStudentEngagement(classId, materialId);
  const [sort, setSort] = useState<SortKey>('name');

  const sortedStudents = useMemo(() => {
    if (!data) return [];
    const rows = [...data.students];
    switch (sort) {
      case 'progress_desc':
        rows.sort((a, b) => b.progress_percent - a.progress_percent);
        break;
      case 'progress_asc':
        rows.sort((a, b) => a.progress_percent - b.progress_percent);
        break;
      case 'last_activity':
        rows.sort((a, b) => {
          const at = a.last_viewed_at ? new Date(a.last_viewed_at).getTime() : 0;
          const bt = b.last_viewed_at ? new Date(b.last_viewed_at).getTime() : 0;
          return bt - at;
        });
        break;
      case 'time_desc':
        rows.sort((a, b) => b.total_time_spent_seconds - a.total_time_spent_seconds);
        break;
      case 'name':
      default:
        rows.sort((a, b) => displayName(a).localeCompare(displayName(b)));
        break;
    }
    return rows;
  }, [data, sort]);

  const goBackToInsights = () => {
    if (!classId) {
      navigate(-1);
      return;
    }
    navigate(`/teacher/classes/${classId}?view=classes&classId=${classId}&tab=insights`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg"
          onClick={goBackToInsights}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Insights
        </Button>
      </div>

      {isLoading ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : error || !data ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center text-sm text-destructive">
            Failed to load material engagement detail.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg">{data.material_title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {data.material_type ? `${data.material_type} • ` : ''}
                    Last activity: {formatRelative(data.last_activity_at)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-lg border bg-secondary/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Started
                  </p>
                  <p className="text-lg font-semibold">
                    {data.students_started}/{data.enrolled_students}
                  </p>
                </div>
                <div className="rounded-lg border bg-secondary/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Completed
                  </p>
                  <p className="text-lg font-semibold">
                    {data.students_completed}/{data.enrolled_students}
                  </p>
                </div>
                <div className="rounded-lg border bg-secondary/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Avg progress
                  </p>
                  <p className="text-lg font-semibold">
                    {Math.round(data.avg_progress_percent)}%
                  </p>
                </div>
                <div className="rounded-lg border bg-secondary/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Avg time / student
                  </p>
                  <p className="text-lg font-semibold">
                    {formatDurationSeconds(data.avg_time_per_student_seconds)}
                  </p>
                </div>
                <div className="rounded-lg border bg-secondary/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Downloads
                  </p>
                  <p className="text-lg font-semibold">{data.total_downloads}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm">Per-student engagement</CardTitle>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="h-8 text-xs rounded-lg w-48">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="progress_desc">Progress (high → low)</SelectItem>
                    <SelectItem value="progress_asc">Progress (low → high)</SelectItem>
                    <SelectItem value="time_desc">Time spent (most first)</SelectItem>
                    <SelectItem value="last_activity">Last activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {sortedStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No enrolled students yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {sortedStudents.map((student) => (
                    <li
                      key={student.student_id}
                      className="py-3 flex items-center gap-3"
                    >
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        {student.avatar_url ? (
                          <AvatarImage
                            src={student.avatar_url}
                            alt={`${displayName(student)} avatar`}
                            loading="lazy"
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials(student)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {displayName(student)}
                          </p>
                          {student.completed ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] py-0 px-1.5 h-5">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : student.started ? (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] py-0 px-1.5 h-5">
                              <Eye className="h-3 w-3 mr-1" />
                              Started
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 text-muted-foreground">
                              <Circle className="h-3 w-3 mr-1" />
                              Not started
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {student.email}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Progress
                            value={student.progress_percent}
                            className="h-1.5 flex-1 max-w-xs"
                          />
                          <span className="text-[11px] text-muted-foreground w-10 text-right">
                            {Math.round(student.progress_percent)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1" title="Time spent on this material">
                          <Clock className="h-3 w-3" />
                          {formatDurationSeconds(student.total_time_spent_seconds)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {student.download_count}
                        </span>
                        <span>{formatRelative(student.last_viewed_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
