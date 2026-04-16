import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Users,
  UserCheck,
  GraduationCap,
  BookOpen,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  Activity,
  Bug,
} from 'lucide-react';

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminService.getDashboardStats,
  });

  // Fetch recent audit logs
  const { data: auditLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['recent-audit-logs'],
    queryFn: () => adminService.getAuditLogs({ limit: 5 }),
  });

  const statCards = [
    {
      title: 'Pending Teachers',
      value: stats?.pending_teachers || 0,
      icon: UserCheck,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-500/10',
      textColor: 'text-blue-500',
      action: () => navigate('/admin/teachers/pending'),
    },
    {
      title: 'Total Students',
      value: stats?.total_students || 0,
      icon: GraduationCap,
      color: 'bg-green-500',
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-500',
      action: () => navigate('/admin/students'),
    },
    {
      title: 'Total Teachers',
      value: stats?.total_teachers || 0,
      icon: Users,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-500/10',
      textColor: 'text-purple-500',
    },
    {
      title: 'Active Courses',
      value: stats?.active_courses || 0,
      icon: BookOpen,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-500/10',
      textColor: 'text-orange-500',
    },
  ];

  const quickActions = [
    {
      title: 'Review Pending Teachers',
      description: `${stats?.pending_teachers || 0} teachers waiting for approval`,
      icon: UserCheck,
      color: 'bg-blue-600',
      action: () => navigate('/admin/teachers/pending'),
    },
    {
      title: 'Create Student Account',
      description: 'Add a new student to the system',
      icon: GraduationCap,
      color: 'bg-green-600',
      action: () => navigate('/admin/students'),
    },
    {
      title: 'Bug Reports',
      description: 'Review incoming user bug reports',
      icon: Bug,
      color: 'bg-rose-600',
      action: () => navigate('/admin/bug-reports'),
    },
    {
      title: 'System Settings',
      description: 'Configure system-wide settings',
      icon: Activity,
      color: 'bg-purple-600',
      action: () => navigate('/admin/settings'),
    },
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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
    return labels[actionType] || actionType;
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-slate-400 mt-1">Welcome back! Here's what's happening.</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, index) => (
            <Card
              key={index}
              className="bg-slate-800 border-slate-700 p-6 cursor-pointer hover:bg-slate-750 transition-colors"
              onClick={stat.action}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium mb-2">{stat.title}</p>
                  <p className="text-3xl font-bold text-white">
                    {statsLoading ? (
                      <span className="text-slate-600">--</span>
                    ) : (
                      stat.value
                    )}
                  </p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Pending Teachers Alert */}
        {stats && stats.pending_teachers > 0 && (
          <Card className="bg-blue-500/10 border-blue-500/30 p-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  {stats.pending_teachers} Teacher{stats.pending_teachers !== 1 ? 's' : ''} Awaiting Approval
                </h3>
                <p className="text-blue-300 text-sm mb-3">
                  Review and approve teacher applications to grant them access to the system.
                </p>
                <Button
                  onClick={() => navigate('/admin/teachers/pending')}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Review Now
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Card
                key={index}
                className="bg-slate-800 border-slate-700 p-6 cursor-pointer hover:bg-slate-750 transition-colors group"
                onClick={action.action}
              >
                <div className={`${action.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4`}>
                  <action.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-white font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                  {action.title}
                </h3>
                <p className="text-slate-400 text-sm">{action.description}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin/audit-logs')}
              className="text-slate-400 hover:text-white"
            >
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          <Card className="bg-slate-800 border-slate-700">
            {logsLoading ? (
              <div className="p-8 text-center text-slate-400">
                Loading recent activity...
              </div>
            ) : auditLogs && auditLogs.logs.length > 0 ? (
              <div className="divide-y divide-slate-700">
                {auditLogs.logs.map((log) => (
                  <div key={log.id} className="p-4 hover:bg-slate-750 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-white font-medium mb-1">
                          {getActionLabel(log.action_type)}
                        </p>
                        <p className="text-slate-400 text-sm">
                          {log.admin?.first_name} {log.admin?.last_name}
                          {log.target_user && (
                            <span>
                              {' → '}
                              {log.target_user.first_name} {log.target_user.last_name}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-slate-500 text-sm">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                No recent activity
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
