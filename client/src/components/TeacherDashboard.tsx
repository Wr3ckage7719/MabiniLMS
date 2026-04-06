import { Users, BookOpen, Clock, TrendingUp, Plus, ChevronRight, Calendar, AlertCircle, Archive, Settings, CheckCircle2, AlertTriangle, ChevronLeft, Bell, Edit2, Trash2, FileText, Megaphone, RotateCw } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockClasses, mockAssignments, mockStudentSubmissions, mockMaterials, mockAnnouncements } from '@/lib/data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TeacherClassesSection } from './TeacherClassesSection';
import { TeacherClassesView } from './TeacherClassesView';

interface TeacherDashboardProps {
  currentView: 'dashboard' | 'calendar' | 'classes' | 'archived' | 'settings';
}

export function TeacherDashboard({ currentView }: TeacherDashboardProps) {
  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return renderDashboard();
      case 'calendar':
        return renderCalendar();
      case 'classes':
        return renderClasses();
      case 'archived':
        return renderArchived();
      case 'settings':
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  const renderDashboard = () => {
    // Calculate total students
    const totalStudents = mockClasses.reduce((sum, cls) => sum + cls.students, 0);
    
    // Get upcoming deadlines (next 7 days, sorted by due date)
    const today = new Date('2026-04-06');
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = mockAssignments
      .filter(a => {
        const dueDate = new Date(a.dueDate);
        return dueDate > today && dueDate <= nextWeek;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);

    // Get recent submissions (last 5)
    const recentSubmissions = mockStudentSubmissions.slice(0, 5);

    // Get class info helper
    const getClassInfo = (classId: string) => {
      return mockClasses.find(c => c.id === classId);
    };

    // Get assignment info helper
    const getAssignmentInfo = (classId: string, assignmentId: string) => {
      return mockAssignments.find(a => a.id === assignmentId && a.classId === classId);
    };

    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Welcome Back!</h1>
            <p className="text-muted-foreground">Here's a quick overview of your teaching dashboard.</p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Total Classes Card */}
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-primary/5 to-primary/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Classes</CardTitle>
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">{mockClasses.length}</p>
                  <p className="text-xs text-muted-foreground">classes active</p>
                </div>
              </CardContent>
            </Card>

            {/* Total Students Card */}
            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-gradient-to-br from-accent/5 to-accent/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
                  <div className="p-2 bg-accent/20 rounded-lg">
                    <Users className="h-4 w-4 text-accent" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold">{totalStudents}</p>
                  <p className="text-xs text-muted-foreground">across all classes</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upcoming Deadlines */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Upcoming Deadlines
                </h2>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary">
                  View all <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>

              <Card className="border-0 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                  {upcomingDeadlines.length > 0 ? (
                    <div className="divide-y">
                      {upcomingDeadlines.map((assignment, index) => {
                        const cls = getClassInfo(assignment.classId);
                        const daysUntilDue = Math.ceil(
                          (new Date(assignment.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                        );
                        const isUrgent = daysUntilDue <= 2;

                        return (
                          <div
                            key={assignment.id}
                            className="p-4 hover:bg-secondary/50 transition-colors duration-200 last:border-b-0 cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium text-sm truncate">{assignment.title}</p>
                                  {isUrgent && (
                                    <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">{cls?.name}</p>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex px-2 py-0.5 bg-secondary text-xs rounded-full font-medium">
                                    {assignment.type === 'assignment' && 'Assignment'}
                                    {assignment.type === 'quiz' && 'Quiz'}
                                    {assignment.type === 'project' && 'Project'}
                                    {assignment.type === 'discussion' && 'Discussion'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{assignment.points} pts</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <span className={`text-sm font-semibold whitespace-nowrap ${
                                  isUrgent ? 'text-orange-600' : 'text-muted-foreground'
                                }`}>
                                  {daysUntilDue} day{daysUntilDue !== 1 ? 's' : ''}
                                </span>
                                <p className="text-xs text-muted-foreground whitespace-nowrap">
                                  {new Date(assignment.dueDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric'
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No upcoming deadlines in the next 7 days</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Submissions */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent" />
                Recent Submissions
              </h2>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  {recentSubmissions.length > 0 ? (
                    <div className="divide-y max-h-96 overflow-y-auto">
                      {recentSubmissions.map((submission) => {
                        const cls = getClassInfo(submission.classId);
                        const statusIcon = submission.status === 'graded' 
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-blue-600" />;

                        return (
                          <div
                            key={submission.id}
                            className="p-4 hover:bg-secondary/50 transition-colors duration-200 last:border-b-0 cursor-pointer"
                          >
                            <div className="flex items-start gap-3 mb-2">
                              <Avatar className="h-8 w-8 flex-shrink-0">
                                <AvatarFallback className="bg-primary/20 text-xs font-medium">
                                  {submission.studentAvatar}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{submission.studentName}</p>
                                <p className="text-xs text-muted-foreground truncate">{cls?.name}</p>
                              </div>
                              {statusIcon}
                            </div>
                            <div className="ml-11 space-y-1">
                              <p className="text-xs text-muted-foreground truncate">{submission.assignmentTitle}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">{submission.submittedDate}</p>
                                {submission.grade && (
                                  <span className="text-xs font-semibold text-primary">{submission.grade}%</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No recent submissions</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 1));
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [editingEvent, setEditingEvent] = useState<string | null>(null);
    const [showNotification, setShowNotification] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isPast = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() < today.getTime();
    };

    // Get past assignments for history view
    const pastAssignments = useMemo(() => {
      return mockAssignments
        .filter(a => {
          const assignDate = new Date(a.dueDate);
          assignDate.setHours(0, 0, 0, 0);
          return assignDate < today;
        })
        .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
    }, []);

    // Group past assignments by date for history view
    const groupedPastAssignments = useMemo(() => {
      return pastAssignments.reduce<Record<string, typeof mockAssignments>>((acc, a) => {
        const key = a.dueDate;
        if (!acc[key]) acc[key] = [];
        acc[key].push(a);
        return acc;
      }, {});
    }, [pastAssignments]);

    // Get past materials for history view
    const pastMaterials = useMemo(() => {
      return mockMaterials
        .filter(m => {
          const uploadDate = new Date(m.uploadedDate);
          uploadDate.setHours(0, 0, 0, 0);
          return uploadDate < today;
        })
        .sort((a, b) => new Date(b.uploadedDate).getTime() - new Date(a.uploadedDate).getTime());
    }, []);

    // Get past announcements (for this we'll use mock dates)
    const pastAnnouncements = useMemo(() => {
      return mockAnnouncements;
    }, []);

    // Group all activities by date
    const groupedAllActivities = useMemo(() => {
      const activities: Record<string, Array<{ type: 'assignment' | 'material' | 'announcement'; data: any }>> = {};
      
      // Add past assignments
      pastAssignments.forEach(a => {
        if (!activities[a.dueDate]) activities[a.dueDate] = [];
        activities[a.dueDate].push({ type: 'assignment', data: a });
      });

      // Add past materials
      pastMaterials.forEach(m => {
        if (!activities[m.uploadedDate]) activities[m.uploadedDate] = [];
        activities[m.uploadedDate].push({ type: 'material', data: m });
      });

      // Add announcements (use today's date as approximation)
      const todayStr = new Date().toISOString().split('T')[0];
      pastAnnouncements.forEach(ann => {
        if (!activities[todayStr]) activities[todayStr] = [];
        activities[todayStr].push({ type: 'announcement', data: ann });
      });

      return activities;
    }, [pastAssignments, pastMaterials, pastAnnouncements]);

    const sortedAllActivityDates = Object.keys(groupedAllActivities).sort().reverse();

    const calendar = useMemo(() => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());
      
      const days: Array<{ date: Date; isCurrentMonth: boolean; assignments: typeof mockAssignments }> = [];
      const current = new Date(startDate);
      
      while (current <= lastDay || current.getDay() !== 0) {
        const isCurrentMonth = current.getMonth() === month;
        const dateStr = current.toISOString().split('T')[0];
        const dayAssignments = mockAssignments.filter(a => a.dueDate === dateStr);
        
        days.push({
          date: new Date(current),
          isCurrentMonth,
          assignments: dayAssignments,
        });
        
        current.setDate(current.getDate() + 1);
      }
      
      return days;
    }, [currentDate]);

    const isToday = (date: Date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    };

    const selectedDateAssignments = useMemo(() => {
      if (!selectedDate) return [];
      const dateStr = selectedDate.toISOString().split('T')[0];
      return mockAssignments.filter(a => a.dueDate === dateStr);
    }, [selectedDate]);

    const monthName = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const handleAddEvent = (date: Date) => {
      setSelectedDate(date);
      setEditingEvent('new');
      setShowNotification(true);
    };

    const getClassInfo = (classId: string) => {
      return mockClasses.find(c => c.id === classId);
    };

    // History View
    if (showHistory) {
      return (
        <div className="w-full h-full overflow-auto animate-fade-in">
          <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-start gap-2 md:gap-3 mb-2">
                  <Button
                    onClick={() => setShowHistory(false)}
                    variant="ghost"
                    size="icon"
                    className="rounded-lg h-9 w-9 flex-shrink-0 mt-0.5"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Assignment History
                  </h1>
                </div>
                <p className="text-sm md:text-base text-muted-foreground mt-2 ml-12 md:ml-0">Activities, materials, and announcements you've shared with your students</p>
              </div>
              <Button
                onClick={() => setShowHistory(false)}
                variant="default"
                className="w-full md:w-fit transition-all duration-300"
              >
                <Clock className="h-4 w-4 mr-2" />
                Back to Calendar
              </Button>
            </div>

            {/* History List */}
            <div className="space-y-3 md:space-y-4 animate-stagger">
              {sortedAllActivityDates.map((date, dateIdx) => (
                <div key={date} style={{ animation: `fade-in 0.4s ease-out ${dateIdx * 30}ms both` }}>
                  <div className="mb-2 md:mb-3">
                    <h3 className="text-xs md:text-sm font-semibold flex items-center gap-2 text-muted-foreground px-1">
                      <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      <span className="text-xs md:text-sm">{new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {groupedAllActivities[date].map((activity, actIdx) => {
                      const cls = getClassInfo(activity.data.classId);
                      
                      if (activity.type === 'assignment') {
                        const a = activity.data;
                        return (
                          <Card
                            key={`${a.id}-assignment`}
                            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-primary/5 to-transparent"
                            style={{
                              animation: `fade-in 0.3s ease-out ${(dateIdx * 30) + (actIdx * 50)}ms both`,
                            }}
                          >
                            <CardContent className="p-3 md:p-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                                  <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{cls?.name}</p>
                                  <div className="flex items-center gap-2 flex-wrap mt-2">
                                    <Badge variant="secondary" className="text-xs capitalize">{a.status}</Badge>
                                    <Badge variant="outline" className="text-xs">{a.points} pts</Badge>
                                    <span className="text-xs text-primary font-medium capitalize">{a.type}</span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      if (activity.type === 'material') {
                        const m = activity.data;
                        return (
                          <Card
                            key={`${m.id}-material`}
                            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-accent/5 to-transparent"
                            style={{
                              animation: `fade-in 0.3s ease-out ${(dateIdx * 30) + (actIdx * 50)}ms both`,
                            }}
                          >
                            <CardContent className="p-3 md:p-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-accent/20 rounded-lg flex-shrink-0">
                                  <FileText className="h-4 w-4 text-accent" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm md:text-base truncate">{m.title}</p>
                                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{cls?.name}</p>
                                  <div className="flex items-center gap-2 flex-wrap mt-2">
                                    <Badge variant="secondary" className="text-xs capitalize">{m.fileType}</Badge>
                                    <span className="text-xs text-muted-foreground">{m.fileSize}</span>
                                    <span className="text-xs text-accent font-medium">{m.downloads} downloads</span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }

                      if (activity.type === 'announcement') {
                        const ann = activity.data;
                        return (
                          <Card
                            key={`${ann.id}-announcement`}
                            className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer bg-gradient-to-r from-orange-50/50 dark:from-orange-950/20 to-transparent"
                            style={{
                              animation: `fade-in 0.3s ease-out ${(dateIdx * 30) + (actIdx * 50)}ms both`,
                            }}
                          >
                            <CardContent className="p-3 md:p-4">
                              <div className="flex items-start gap-3">
                                <div className="p-2 bg-orange-500/20 rounded-lg flex-shrink-0">
                                  <Megaphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm md:text-base truncate">{ann.author}</p>
                                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">{ann.content}</p>
                                  <div className="flex items-center gap-2 flex-wrap mt-2">
                                    <Badge variant="secondary" className="text-xs">Announcement</Badge>
                                    <span className="text-xs text-muted-foreground">{ann.comments} comments</span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      }
                    })}
                  </div>
                </div>
              ))}
              {sortedAllActivityDates.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No past activities yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Calendar View
    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Calendar
              </h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Track deadlines and manage assignments across your classes</p>
            </div>
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant={showHistory ? 'default' : 'outline'}
              className="w-full md:w-fit transition-all duration-300"
            >
              <Clock className="h-4 w-4 mr-2" />
              {showHistory ? 'Current View' : 'View History'}
            </Button>
          </div>

          {/* Month Controller */}
          <div className="flex items-center justify-between gap-2 md:gap-4">
            <Button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
              variant="outline"
              size="icon"
              className="hover:bg-primary/10 h-9 w-9 md:h-10 md:w-10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg md:text-2xl font-semibold text-primary text-center flex-1">{monthName}</h2>
            <Button
              onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
              variant="outline"
              size="icon"
              className="hover:bg-primary/10 h-9 w-9 md:h-10 md:w-10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50/80 via-white/95 to-blue-50/60 dark:from-slate-900/95 dark:via-slate-900/98 dark:to-slate-800/95 backdrop-blur-md overflow-hidden">
            <div className="p-3 md:p-4 lg:p-6">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-3 md:mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs md:text-sm font-semibold text-muted-foreground py-2 md:py-3 border-b border-border/50"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendar.map((day, idx) => {
                  const dateStr = day.date.toISOString().split('T')[0];
                  const isCurrentDay = isToday(day.date);
                  const isPastDay = isPast(day.date);
                  const hasDeadlines = day.assignments.length > 0;
                  const hasLateDeadlines = day.assignments.some(a => a.status === 'late');

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleAddEvent(day.date)}
                      className={`
                        relative aspect-square rounded-lg md:rounded-xl overflow-hidden
                        transition-all duration-300 transform
                        ${!day.isCurrentMonth ? 'opacity-40' : ''}
                        ${isCurrentDay
                          ? 'ring-2 ring-primary ring-offset-2 shadow-lg scale-105'
                          : 'hover:shadow-md hover:scale-[1.02]'
                        }
                        ${hasLateDeadlines
                          ? 'bg-destructive/10 border-2 border-destructive/30'
                          : hasDeadlines
                          ? 'bg-primary/5 border-2 border-primary/20'
                          : 'bg-secondary/30 border-2 border-transparent'
                        }
                        group cursor-pointer
                      `}
                      style={{
                        animation: `fade-in 0.4s ease-out ${idx * 20}ms both`,
                      }}
                    >
                      {/* Day Number */}
                      <div className="absolute top-1 right-1 md:top-2 md:right-2">
                        <span className={`
                          text-xs md:text-sm font-bold
                          ${isCurrentDay ? 'text-primary' : isPastDay ? 'text-muted-foreground' : 'text-foreground'}
                        `}>
                          {day.date.getDate()}
                        </span>
                      </div>

                      {/* Content Area */}
                      <div className="h-full flex flex-col p-1 md:p-2 gap-0.5 justify-start">
                        {/* Activity Indicators */}
                        {hasDeadlines && (
                          <div className="flex items-start gap-0.5 flex-wrap">
                            {day.assignments.slice(0, 2).map((assignment, i) => {
                              const cls = getClassInfo(assignment.classId);
                              return (
                                <div
                                  key={`${assignment.id}-${i}`}
                                  className="text-xs font-semibold px-1 md:px-1.5 py-0.5 rounded bg-primary/80 text-primary-foreground line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                  title={assignment.title}
                                >
                                  {cls?.name.split(' ')[0]}
                                </div>
                              );
                            })}
                            {day.assignments.length > 2 && (
                              <div className="text-xs font-semibold px-1 py-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                +{day.assignments.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Selected Date Details */}
          {selectedDate && (
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base md:text-lg">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </CardTitle>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDate(null)}>
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedDateAssignments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDateAssignments.map((assignment) => {
                      const cls = getClassInfo(assignment.classId);
                      return (
                        <div
                          key={assignment.id}
                          className="p-3 bg-secondary/50 rounded-lg border border-border/50 space-y-2"
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{assignment.title}</p>
                              <p className="text-xs text-muted-foreground">{cls?.name}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => {
                                setEditingEvent(assignment.id);
                                setShowNotification(true);
                              }}>
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full capitalize font-medium">
                              {assignment.type}
                            </span>
                            <span className="text-xs text-muted-foreground">{assignment.points} pts</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {assignment.status === 'late' && 'Late'}
                              {assignment.status === 'assigned' && 'Assigned'}
                              {assignment.status === 'submitted' && 'Submitted'}
                              {assignment.status === 'graded' && 'Graded'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No deadlines on this date</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notification Dialog */}
          <Dialog open={showNotification} onOpenChange={setShowNotification}>
            <DialogContent className="rounded-xl w-full max-w-md">
              <DialogHeader>
                <DialogTitle>{editingEvent === 'new' ? 'Add Event' : 'Edit Event'}</DialogTitle>
                <DialogDescription>
                  {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="event-title">Assignment Title</Label>
                  <Input id="event-title" placeholder="Enter assignment title" className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-class">Class</Label>
                  <select className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm w-full">
                    {mockClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Send notification to students
                  </Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex flex-col md:flex-row gap-2 pt-4">
                  <Button variant="outline" className="md:flex-1" onClick={() => setShowNotification(false)}>
                    Cancel
                  </Button>
                  <Button className="md:flex-1 bg-primary" onClick={() => {
                    setShowNotification(false);
                    setEditingEvent(null);
                  }}>
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  };

  const renderClasses = () => <TeacherClassesView />;

  const renderArchived = () => {
    // Get archived classes (simulated - classes with archived flag)
    const [localArchivedClasses, setLocalArchivedClasses] = useState(
      mockClasses.filter(cls => cls.archived === true)
    );

    const handleRestore = (classId: string) => {
      setLocalArchivedClasses(localArchivedClasses.filter(cls => cls.id !== classId));
    };

    return (
      <div className="w-full h-full overflow-auto animate-fade-in">
        <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Archived Classes</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">View and restore your past and completed classes.</p>
            </div>
          </div>

          {/* Archived Classes Grid */}
          {localArchivedClasses.length > 0 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Archived ({localArchivedClasses.length})</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 animate-stagger">
                {localArchivedClasses.map((cls, idx) => (
                  <Card
                    key={cls.id}
                    className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                    style={{
                      animation: `fade-in 0.4s ease-out ${idx * 50}ms both`,
                    }}
                  >
                    {/* Class Header */}
                    <div className={`h-24 md:h-28 bg-gradient-to-br ${
                      cls.color === 'blue' ? 'from-blue-400 to-blue-600' :
                      cls.color === 'teal' ? 'from-teal-400 to-teal-600' :
                      cls.color === 'purple' ? 'from-purple-400 to-purple-600' :
                      cls.color === 'orange' ? 'from-orange-400 to-orange-600' :
                      cls.color === 'pink' ? 'from-pink-400 to-pink-600' :
                      'from-green-400 to-green-600'
                    } opacity-80 group-hover:opacity-90 transition-opacity`} />

                    {/* Content */}
                    <CardContent className="p-4 md:p-5 space-y-3">
                      {/* Class Info */}
                      <div className="space-y-1.5">
                        <h3 className="font-semibold text-base md:text-lg line-clamp-2 group-hover:text-primary transition-colors">
                          {cls.name}
                        </h3>
                        <p className="text-xs md:text-sm text-muted-foreground line-clamp-1">{cls.section}</p>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{cls.students}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{cls.pendingAssignments} assignments</span>
                        </div>
                      </div>

                      {/* Restore Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full rounded-lg text-xs md:text-sm h-8 md:h-9 mt-2"
                        onClick={() => handleRestore(cls.id)}
                      >
                        <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                        Restore Class
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8 md:p-12 text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Archive className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">No Archived Classes</h3>
                  <p className="text-sm text-muted-foreground mt-1">You don't have any archived classes yet. Archive completed classes to keep your dashboard organized.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    const [darkMode, setDarkMode] = useState(() => {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('theme') === 'dark' || document.documentElement.classList.contains('dark');
      }
      return false;
    });

    useEffect(() => {
      if (darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }, [darkMode]);

    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Settings</h1>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">SC</AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm" className="rounded-xl">Change avatar</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First name</Label>
                <Input defaultValue="Sarah" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input defaultValue="Chen" className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input defaultValue="sarah.chen@school.edu" className="rounded-xl" disabled />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input defaultValue="Mathematics" className="rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Enable dark theme for the application</p>
              </div>
              <Switch checked={darkMode} onCheckedChange={setDarkMode} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">Notifications</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Student submissions', desc: 'Notify when students submit assignments' },
              { label: 'Grading reminders', desc: 'Remind me when assignments need grading' },
              { label: 'Class announcements', desc: 'Notify on new class announcements' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch defaultChecked />
              </div>
            ))}
          </CardContent>
        </Card>

        <Button className="rounded-xl">Save changes</Button>
      </div>
    );
  };

  return renderContent();
}


