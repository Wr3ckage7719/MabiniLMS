import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  MoreVertical,
  Search,
  Filter,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { useCourseSubmissions } from '@/hooks/useTeacherData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TeacherRecentSubmissionsProps {
  classId: string;
}

// Helper to get initials from name
function getInitials(firstName: string | null, lastName: string | null): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '??';
}

// Helper to get full name
function getFullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Student';
}

// Helper to format date
function formatSubmittedDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export function TeacherRecentSubmissions({
  classId,
}: TeacherRecentSubmissionsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'assignment'>('recent');

  // Fetch real submissions from API
  const { submissions, loading, error, refetch } = useCourseSubmissions(classId);

  // Determine if submission is early, on-time, or late
  const getSubmissionTiming = (
    submittedAt: string,
    dueDate: string | null
  ): 'early' | 'on-time' | 'late' => {
    if (!dueDate) return 'on-time';
    
    const submitted = new Date(submittedAt);
    const due = new Date(dueDate);
    const diffHours = (due.getTime() - submitted.getTime()) / (1000 * 60 * 60);
    
    if (diffHours > 24) return 'early'; // More than 24 hours before due
    if (diffHours >= 0) return 'on-time'; // Before or exactly at due date
    return 'late'; // After due date
  };

  // Filter submissions
  let filteredSubmissions = submissions.filter((s) => {
    const studentName = getFullName(s.student?.first_name, s.student?.last_name);
    const assignmentTitle = s.assignment?.title || '';
    
    const matchesSearch =
      studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      assignmentTitle.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterStatus === 'all') return matchesSearch;

    const timing = getSubmissionTiming(s.submitted_at, s.assignment?.due_date || null);
    return matchesSearch && timing === filterStatus;
  });

  // Sort submissions
  if (sortBy === 'name') {
    filteredSubmissions = [...filteredSubmissions].sort((a, b) => {
      const nameA = getFullName(a.student?.first_name, a.student?.last_name);
      const nameB = getFullName(b.student?.first_name, b.student?.last_name);
      return nameA.localeCompare(nameB);
    });
  } else if (sortBy === 'assignment') {
    filteredSubmissions = [...filteredSubmissions].sort((a, b) =>
      (a.assignment?.title || '').localeCompare(b.assignment?.title || '')
    );
  }
  // 'recent' keeps the default order (already sorted by date)

  // Calculate statistics
  const stats = {
    total: submissions.length,
    early: submissions.filter(
      (s) => getSubmissionTiming(s.submitted_at, s.assignment?.due_date || null) === 'early'
    ).length,
    onTime: submissions.filter(
      (s) => getSubmissionTiming(s.submitted_at, s.assignment?.due_date || null) === 'on-time'
    ).length,
    late: submissions.filter(
      (s) => getSubmissionTiming(s.submitted_at, s.assignment?.due_date || null) === 'late'
    ).length,
    graded: submissions.filter((s) => s.status === 'graded' || s.grade).length,
  };

  const getTimingColor = (
    timing: 'early' | 'on-time' | 'late'
  ): string => {
    switch (timing) {
      case 'early':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'on-time':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'late':
        return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const getTimingIcon = (
    timing: 'early' | 'on-time' | 'late'
  ): React.ReactNode => {
    switch (timing) {
      case 'early':
        return <TrendingUp className="h-4 w-4" />;
      case 'on-time':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'late':
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'graded':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'returned':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-3" />
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-green-700">
              Early
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">{stats.early}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-700">
              On Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-700">{stats.onTime}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-red-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-700">
              Late
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-700">{stats.late}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Graded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.graded}</p>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search submissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-lg"
          />
        </div>

        {/* Filter Status */}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-40 rounded-lg">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="early">Early</SelectItem>
            <SelectItem value="on-time">On Time</SelectItem>
            <SelectItem value="late">Late</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger className="w-full sm:w-40 rounded-lg">
            <Clock className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="name">Student Name</SelectItem>
            <SelectItem value="assignment">Assignment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Submissions List */}
      {filteredSubmissions.length > 0 ? (
        <div className="space-y-3 animate-stagger">
          {filteredSubmissions.map((submission, idx) => {
            const studentName = getFullName(submission.student?.first_name, submission.student?.last_name);
            const studentInitials = getInitials(submission.student?.first_name, submission.student?.last_name);
            const timing = getSubmissionTiming(
              submission.submitted_at,
              submission.assignment?.due_date || null
            );

            return (
              <Card
                key={submission.id}
                className="border-0 shadow-sm hover:shadow-md transition-all"
                style={{
                  animation: `fade-in 0.4s ease-out ${idx * 40}ms both`,
                }}
              >
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col gap-3">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-4">
                      {/* Student and Assignment */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {studentInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-sm line-clamp-1">
                            {studentName}
                          </h4>
                          <p className="text-xs md:text-sm text-muted-foreground line-clamp-1">
                            {submission.assignment?.title || 'Assignment'}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg flex-shrink-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-lg w-48">
                          <DropdownMenuItem className="cursor-pointer gap-2">
                            <Download className="h-4 w-4" />
                            Download Submission
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer">
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer">
                            Add Comment
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Details Row */}
                    <div className="flex flex-wrap gap-2 items-center">
                      {/* Timing Badge */}
                      <Badge
                        variant="outline"
                        className={`rounded-full text-xs flex items-center gap-1 ${getTimingColor(
                          timing
                        )}`}
                      >
                        {getTimingIcon(timing)}
                        {timing === 'early'
                          ? 'Early'
                          : timing === 'on-time'
                          ? 'On Time'
                          : 'Late'}
                      </Badge>

                      {/* Submission Date */}
                      <Badge variant="outline" className="rounded-full text-xs">
                        {formatSubmittedDate(submission.submitted_at)}
                      </Badge>

                      {/* Status */}
                      <Badge
                        variant="outline"
                        className={`rounded-full text-xs ${getStatusBadgeColor(
                          submission.status
                        )}`}
                      >
                        {submission.status}
                      </Badge>

                      {/* Grade if available */}
                      {submission.grade && (
                        <Badge
                          variant="outline"
                          className="rounded-full text-xs bg-amber-50 text-amber-700 border-amber-200"
                        >
                          {submission.grade.points_earned}/{submission.assignment?.max_points || '?'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery || filterStatus !== 'all'
                ? 'No submissions match your filters.'
                : 'No submissions yet.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <Card className="border-0 shadow-sm bg-muted/30">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground space-y-2">
            <p className="font-semibold mb-2">Submission Timing Legend:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span>Early - Submitted before due date</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span>On Time - Submitted by due date</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span>Late - Submitted after due date</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
