import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText, Search, Loader2, ArrowUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const prettifyKey = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getPersonLabel = (person?: { first_name?: string; last_name?: string; email?: string }) => {
  if (!person) return 'Unknown user';

  const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  return person.email || 'Unknown user';
};

const getActionLabel = (actionType: string) => {
  const labels: Record<string, string> = {
    teacher_approved: 'Approved Teacher',
    teacher_rejected: 'Rejected Teacher',
    student_created: 'Created Student',
    students_bulk_created: 'Bulk Created Students',
    role_changed: 'Changed User Role',
    settings_updated: 'Updated Settings',
  };
  return labels[actionType] || prettifyKey(actionType);
};

const getLogSummary = (log: adminService.AuditLog): string => {
  const details = log.details || {};
  const targetLabel = getPersonLabel(log.target_user);

  switch (log.action_type) {
    case 'teacher_approved': {
      const teacher = details.teacher_name || details.teacher_email || targetLabel;
      return `Approved teacher account for ${teacher}.`;
    }
    case 'teacher_rejected': {
      const teacher = details.teacher_name || details.teacher_email || targetLabel;
      const reason = details.reason ? ` Reason: ${details.reason}.` : '';
      return `Rejected teacher account for ${teacher}.${reason}`;
    }
    case 'student_created': {
      const student = details.student_name || details.student_email || targetLabel;
      return `Created student account for ${student}.`;
    }
    case 'students_bulk_created': {
      const total = formatValue(details.total);
      const created = formatValue(details.created);
      const failed = formatValue(details.failed);
      return `Bulk student import completed: ${created} created, ${failed} failed, ${total} total.`;
    }
    case 'role_changed': {
      const oldRole = details.old_role ? prettifyKey(String(details.old_role)) : 'Unknown';
      const newRole = details.new_role ? prettifyKey(String(details.new_role)) : 'Unknown';
      return `Changed role for ${targetLabel} from ${oldRole} to ${newRole}.`;
    }
    case 'settings_updated': {
      const setting = details.setting_key ? prettifyKey(String(details.setting_key)) : 'System setting';
      const hasOld = Object.prototype.hasOwnProperty.call(details, 'old_value');
      const hasNew = Object.prototype.hasOwnProperty.call(details, 'new_value');
      if (hasOld && hasNew) {
        return `Updated ${setting} from ${formatValue(details.old_value)} to ${formatValue(details.new_value)}.`;
      }
      if (hasNew) {
        return `Updated ${setting} to ${formatValue(details.new_value)}.`;
      }
      return `Updated ${setting}.`;
    }
    default: {
      const detailPreview = Object.entries(details)
        .slice(0, 2)
        .map(([key, value]) => `${prettifyKey(key)}: ${formatValue(value)}`)
        .join(' • ');
      return detailPreview || 'Administrative action recorded.';
    }
  }
};

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'action' | 'actor'>('newest');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => adminService.getAuditLogs({ limit, offset: page * limit }),
  });

  const filteredLogs = useMemo(() => {
    const logs = data?.logs || [];
    const search = searchTerm.trim().toLowerCase();

    const matched = search
      ? logs.filter((log) => {
          const action = getActionLabel(log.action_type).toLowerCase();
          const actor = getPersonLabel(log.admin).toLowerCase();
          const actorEmail = (log.admin?.email || '').toLowerCase();
          const summary = getLogSummary(log).toLowerCase();
          const target = getPersonLabel(log.target_user).toLowerCase();

          return (
            action.includes(search) ||
            actor.includes(search) ||
            actorEmail.includes(search) ||
            target.includes(search) ||
            summary.includes(search)
          );
        })
      : logs;

    return [...matched].sort((a, b) => {
      if (sortBy === 'action') {
        return getActionLabel(a.action_type).localeCompare(getActionLabel(b.action_type));
      }

      if (sortBy === 'actor') {
        return getPersonLabel(a.admin).localeCompare(getPersonLabel(b.admin));
      }

      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      if (sortBy === 'oldest') {
        return aTime - bTime;
      }

      return bTime - aTime;
    });
  }, [data?.logs, searchTerm, sortBy]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full bg-background p-6">
      <div className="max-w-6xl mx-auto h-full flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Audit Logs</h1>
          <p className="text-muted-foreground">Track all administrative actions</p>
        </div>

        <Card className="bg-card border-border p-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="w-full md:w-52 bg-background border-input text-foreground">
                <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="action">Action (A to Z)</SelectItem>
                <SelectItem value="actor">Actor (A to Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {isLoading ? (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading audit logs...</p>
            </div>
          </Card>
        ) : data && data.logs.length > 0 ? (
          <Card className="bg-card border-border">
            <div className="flex flex-col">
              <div className="max-h-[62vh] overflow-y-auto">
                <div className="sticky top-0 z-10 grid grid-cols-12 gap-3 border-b border-border bg-card/95 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur md:px-5">
                  <span className="col-span-7 md:col-span-5">Action</span>
                  <span className="hidden md:block md:col-span-4">Actor / Target</span>
                  <span className="col-span-5 md:col-span-3 text-right">Time</span>
                </div>

                {filteredLogs.length === 0 ? (
                  <div className="p-10 text-center text-muted-foreground">No logs match your search.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredLogs.map((log) => {
                      const actorLabel = getPersonLabel(log.admin);
                      const targetLabel = log.target_user ? getPersonLabel(log.target_user) : null;

                      return (
                        <div key={log.id} className="p-4 md:p-5 hover:bg-accent/40 transition-colors">
                          <div className="grid grid-cols-12 gap-3 items-start">
                            <div className="col-span-7 md:col-span-5 min-w-0">
                              <p className="text-foreground font-semibold mb-1">{getActionLabel(log.action_type)}</p>
                              <p className="text-xs text-muted-foreground md:hidden">
                                By {actorLabel}
                                {log.admin?.email ? ` (${log.admin.email})` : ''}
                                {targetLabel ? ` • Target: ${targetLabel}` : ''}
                              </p>
                            </div>
                            <div className="hidden md:block md:col-span-4 min-w-0">
                              <p className="text-sm text-foreground/80 truncate" title={actorLabel}>
                                {actorLabel}
                                {log.admin?.email ? ` (${log.admin.email})` : ''}
                              </p>
                              <p className="text-xs text-muted-foreground truncate" title={targetLabel || undefined}>
                                {targetLabel ? `Target: ${targetLabel}` : 'Target: N/A'}
                              </p>
                            </div>
                            <div className="col-span-5 md:col-span-3 text-right">
                              <span className="text-xs md:text-sm text-muted-foreground whitespace-nowrap">
                                {formatDate(log.created_at)}
                              </span>
                            </div>
                          </div>

                          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{getLogSummary(log)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {data.total > limit && (
                <div className="p-4 border-t border-border flex items-center justify-between">
                  <Button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    variant="outline"
                    className="border-border"
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground text-sm">
                    Page {page + 1} of {Math.ceil(data.total / limit)}
                  </span>
                  <Button
                    onClick={() => setPage(page + 1)}
                    disabled={(page + 1) * limit >= data.total}
                    variant="outline"
                    className="border-border"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p>No audit logs found</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
