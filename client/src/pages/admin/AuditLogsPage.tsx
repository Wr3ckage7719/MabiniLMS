import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FileText, Search, Filter, Loader2 } from 'lucide-react';

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => adminService.getAuditLogs({ limit, offset: page * limit }),
  });

  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      teacher_approved: 'Approved Teacher',
      teacher_rejected: 'Rejected Teacher',
      student_created: 'Created Student',
      students_bulk_created: 'Bulk Created Students',
      role_changed: 'Changed User Role',
      settings_updated: 'Updated Settings',
    };
    return labels[actionType] || actionType;
  };

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
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
          <p className="text-slate-400">Track all administrative actions</p>
        </div>

        <Card className="bg-slate-800 border-slate-700 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-700 text-white"
            />
          </div>
        </Card>

        {isLoading ? (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading audit logs...</p>
            </div>
          </Card>
        ) : data && data.logs.length > 0 ? (
          <Card className="bg-slate-800 border-slate-700">
            <div className="divide-y divide-slate-700">
              {data.logs
                .filter(log =>
                  searchTerm === '' ||
                  getActionLabel(log.action_type).toLowerCase().includes(searchTerm.toLowerCase()) ||
                  log.admin?.email.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-750 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-white font-medium mb-1">
                          {getActionLabel(log.action_type)}
                        </p>
                        <p className="text-sm text-slate-400">
                          {log.admin?.first_name} {log.admin?.last_name} ({log.admin?.email})
                          {log.target_user && (
                            <span>
                              {' → '}
                              {log.target_user.first_name} {log.target_user.last_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-sm text-slate-500">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <div className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-400 font-mono">
                        {JSON.stringify(log.details, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {data.total > limit && (
              <div className="p-4 border-t border-slate-700 flex items-center justify-between">
                <Button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  variant="outline"
                  className="border-slate-700"
                >
                  Previous
                </Button>
                <span className="text-slate-400 text-sm">
                  Page {page + 1} of {Math.ceil(data.total / limit)}
                </span>
                <Button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= data.total}
                  variant="outline"
                  className="border-slate-700"
                >
                  Next
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center text-slate-400">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p>No audit logs found</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
