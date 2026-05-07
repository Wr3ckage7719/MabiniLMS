import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TabsContent } from '@/components/ui/tabs';
import { RefreshCw, ArrowLeft, Eye, Clock, FileDown, Activity, BarChart2, BookOpen, ChevronRight } from 'lucide-react';
import type { MaterialEngagementEvent } from '@/services/materials.service';

export interface EngagementStat {
  id: string;
  student?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  };
  progress_percent: number;
  completed: boolean;
  view_count: number;
  download_count: number;
  event_count: number;
  avg_session_duration_seconds?: number | null;
  total_scan_seconds?: number | null;
  pages_viewed: number[];
  last_viewed_at: string;
  interaction_events: MaterialEngagementEvent[];
}

interface EngagementPanelProps {
  engagementStats: EngagementStat[];
  engagementLoading: boolean;
  engagementLoadingTimedOut: boolean;
  engagementError: boolean;
  engagementErrorMessage: string;
  teacherAverageProgress: number;
  selectedEngagementStudent: EngagementStat | null;
  setSelectedEngagementStudent: (student: EngagementStat | null) => void;
  refetchEngagement: () => void;
  setEngagementLoadingTimedOut: (value: boolean) => void;
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
};

const formatDuration = (seconds?: number | null): string => {
  if (!seconds || seconds <= 0) return '0s';
  const safe = Math.round(seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

const formatEventTime = (timestamp: string): string => {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleString();
};

const getEventLabel = (event: MaterialEngagementEvent): string => {
  switch (event.type) {
    case 'view_start': return 'Opened material';
    case 'view_end': return 'Ended session';
    case 'download': return 'Downloaded file';
    case 'scroll': return 'Scrolled/scan heartbeat';
    default: return 'Tracked action';
  }
};

const getEventDetails = (event: MaterialEngagementEvent): string | null => {
  if (event.type === 'view_start') {
    const openCount = typeof event.data.open_count === 'number' ? Math.max(1, Math.floor(event.data.open_count)) : 1;
    return openCount > 1 ? `Opened ${openCount} times` : 'Opened once';
  }

  if (event.type === 'view_end') {
    const seconds = typeof event.data.time_spent_seconds === 'number' ? Math.max(0, Math.round(event.data.time_spent_seconds)) : 0;
    const sessionCount = typeof event.data.session_count === 'number' ? Math.max(1, Math.floor(event.data.session_count)) : 1;
    const totalSeconds = typeof event.data.total_time_spent_seconds === 'number' ? Math.max(0, Math.round(event.data.total_time_spent_seconds)) : seconds;
    const percent = typeof event.data.final_scroll_percent === 'number' ? clampPercent(event.data.final_scroll_percent) : 0;
    if (sessionCount > 1) return `${sessionCount} sessions · ${formatDuration(totalSeconds)} total · ${percent.toFixed(2)}%`;
    return `${formatDuration(seconds)} · ${percent.toFixed(2)}%`;
  }

  if (event.type === 'download') {
    const fileName = typeof event.data.file_name === 'string' ? event.data.file_name : null;
    return fileName || 'Tracked download event';
  }

  if (event.type === 'scroll') {
    const percent = typeof event.data.scroll_percent === 'number' ? clampPercent(event.data.scroll_percent) : 0;
    const activeSeconds = typeof event.data.active_seconds === 'number' ? Math.max(0, Math.round(event.data.active_seconds)) : 0;
    const heartbeatCount = typeof event.data.heartbeat_count === 'number' ? Math.max(1, Math.floor(event.data.heartbeat_count)) : 1;
    if (activeSeconds > 0) return `${percent.toFixed(2)}% · ${formatDuration(activeSeconds)} active · ${heartbeatCount} scans`;
    return `${percent.toFixed(2)}%`;
  }

  return null;
};

const getInitials = (item: EngagementStat) => {
  const first = item.student?.first_name?.[0] ?? '';
  const last = item.student?.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
};

const getFullName = (item: EngagementStat) =>
  [item.student?.first_name, item.student?.last_name].filter(Boolean).join(' ').trim() ||
  item.student?.email ||
  'Student';

const getEventIcon = (type: string) => {
  switch (type) {
    case 'view_start': return <Eye className="h-3.5 w-3.5 text-blue-500" />;
    case 'view_end': return <Clock className="h-3.5 w-3.5 text-slate-500" />;
    case 'download': return <FileDown className="h-3.5 w-3.5 text-emerald-600" />;
    case 'scroll': return <Activity className="h-3.5 w-3.5 text-violet-500" />;
    default: return <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

export function EngagementPanel({
  engagementStats,
  engagementLoading,
  engagementLoadingTimedOut,
  engagementError,
  engagementErrorMessage,
  teacherAverageProgress,
  selectedEngagementStudent,
  setSelectedEngagementStudent,
  refetchEngagement,
  setEngagementLoadingTimedOut,
}: EngagementPanelProps) {
  if (selectedEngagementStudent) {
    const item = selectedEngagementStudent;
    const fullName = getFullName(item);
    const allEvents = [...item.interaction_events].reverse();

    return (
      <TabsContent value="engagement" className="mt-0 flex min-h-0 flex-1 flex-col space-y-4">
        <button
          type="button"
          onClick={() => setSelectedEngagementStudent(null)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          All Students
        </button>

        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
          <Avatar className="h-12 w-12 flex-shrink-0">
            <AvatarFallback className="text-sm font-semibold bg-emerald-100 text-emerald-700">
              {getInitials(item)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base truncate">{fullName}</p>
            <p className="text-xs text-muted-foreground">Last viewed {formatEventTime(item.last_viewed_at)}</p>
          </div>
          <Badge variant={item.completed ? 'default' : 'secondary'} className="shrink-0">
            {item.completed ? 'Completed' : 'In Progress'}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Reading Progress</span>
            <span className="font-semibold tabular-nums">{item.progress_percent.toFixed(1)}%</span>
          </div>
          <Progress value={item.progress_percent} className="h-2" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Views', value: item.view_count, icon: <Eye className="h-4 w-4 text-blue-500" /> },
            { label: 'Downloads', value: item.download_count, icon: <FileDown className="h-4 w-4 text-emerald-600" /> },
            { label: 'Avg Session', value: item.avg_session_duration_seconds ? formatDuration(item.avg_session_duration_seconds) : 'N/A', icon: <Clock className="h-4 w-4 text-slate-500" /> },
            { label: 'Scan Time', value: formatDuration(item.total_scan_seconds), icon: <Activity className="h-4 w-4 text-violet-500" /> },
            { label: 'Total Events', value: item.event_count, icon: <BarChart2 className="h-4 w-4 text-orange-500" /> },
            { label: 'Pages Viewed', value: item.pages_viewed.length > 0 ? item.pages_viewed.join(', ') : 'N/A', icon: <BookOpen className="h-4 w-4 text-indigo-500" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3 flex items-start gap-2">
              <div className="mt-0.5">{icon}</div>
              <div>
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Interaction Timeline</p>
          {allEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interaction events captured yet.</p>
          ) : (
            <div className="space-y-2">
              {allEvents.map((event, index) => {
                const eventDetails = getEventDetails(event);
                return (
                  <div key={`${item.id}-${event.type}-${event.timestamp}-${index}`} className="flex items-start gap-3 p-3 rounded-lg border border-border/70 bg-muted/20">
                    <div className="mt-0.5 p-1.5 rounded-md bg-background border border-border/60">
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{getEventLabel(event)}</p>
                      {eventDetails && <p className="text-xs text-muted-foreground mt-0.5">{eventDetails}</p>}
                    </div>
                    <p className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{formatEventTime(event.timestamp)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="engagement" className="mt-0 flex min-h-0 flex-1 flex-col space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Class Engagement</p>
          <Badge variant="secondary">{engagementStats.length} student{engagementStats.length !== 1 ? 's' : ''}</Badge>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Average Progress</span>
            <span className="font-semibold tabular-nums">{teacherAverageProgress.toFixed(1)}%</span>
          </div>
          <Progress value={teacherAverageProgress} className="h-2" />
        </div>
        {engagementStats.length > 0 && (
          <div className="flex gap-4 text-xs text-muted-foreground pt-1">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
              {engagementStats.filter(s => s.completed).length} completed
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
              {engagementStats.filter(s => !s.completed).length} in progress
            </span>
          </div>
        )}
      </div>

      {engagementLoading && !engagementLoadingTimedOut ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Loading engagement analytics...
        </div>
      ) : null}

      {engagementLoadingTimedOut ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
          <p>Engagement request is taking longer than expected.</p>
          <Button type="button" size="sm" variant="outline" className="gap-2"
            onClick={() => { setEngagementLoadingTimedOut(false); void refetchEngagement(); }}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : null}

      {engagementError ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
          <p className="font-medium text-foreground">Could not load engagement analytics.</p>
          <p>{engagementErrorMessage || 'Please try again.'}</p>
          <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void refetchEngagement()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      ) : null}

      {!engagementLoading && !engagementError && engagementStats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
          <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No students have opened this material yet.</p>
        </div>
      ) : null}

      {!engagementLoading && !engagementError && engagementStats.length > 0 ? (
        <div className="space-y-2 min-h-0 flex-1 overflow-auto pr-1">
          {engagementStats.map((item) => {
            const fullName = getFullName(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedEngagementStudent(item)}
                className="w-full text-left rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all p-4 group"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="text-sm font-semibold bg-emerald-100 text-emerald-700">
                      {getInitials(item)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{fullName}</p>
                      <Badge variant={item.completed ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {item.completed ? 'Completed' : 'In Progress'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mb-1.5">
                      <Progress value={item.progress_percent} className="h-1.5 flex-1" />
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{item.progress_percent.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{item.view_count} views</span>
                      {item.download_count > 0 && <span className="flex items-center gap-1"><FileDown className="h-3 w-3" />{item.download_count} dl</span>}
                      <span>Last seen {formatEventTime(item.last_viewed_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </TabsContent>
  );
}
