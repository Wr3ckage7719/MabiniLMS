import { useMemo, useState } from 'react';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useClasses } from '@/hooks-api/useClasses';
import { ChevronLeft, ChevronRight, Clock, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type CalendarAssignment = {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  status: 'assigned' | 'submitted' | 'graded' | 'late';
  type: 'assignment' | 'quiz' | 'project' | 'discussion';
  attachments?: number;
};

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  assignments: CalendarAssignment[];
}

export default function InteractiveCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { data: classes = [] } = useClasses();
  const { data: allAssignments = [], isLoading, error } = useAssignments();

  const today = useMemo(() => {
    const reference = new Date();
    reference.setHours(0, 0, 0, 0);
    return reference;
  }, []);

  const calendar = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const current = new Date(startDate);

    while (current <= lastDay || current.getDay() !== 0) {
      const isCurrentMonth = current.getMonth() === month;
      const dateStr = current.toISOString().split('T')[0];
      const dayAssignments = allAssignments.filter((a) => a.dueDate === dateStr);

      days.push({
        date: new Date(current),
        isCurrentMonth,
        assignments: dayAssignments,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [currentDate, allAssignments]);

  const selectedDateAssignments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.toISOString().split('T')[0];
    return allAssignments.filter((a) => a.dueDate === dateStr);
  }, [selectedDate, allAssignments]);

  const pastAssignments = useMemo(() => {
    return allAssignments
      .filter((a) => {
        const due = new Date(a.dueDate);
        due.setHours(0, 0, 0, 0);
        return due < today;
      })
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [allAssignments, today]);

  const groupedPastAssignments = useMemo(() => {
    return pastAssignments.reduce<Record<string, CalendarAssignment[]>>((acc, assignment) => {
      const key = assignment.dueDate;
      if (!acc[key]) acc[key] = [];
      acc[key].push(assignment);
      return acc;
    }, {});
  }, [pastAssignments]);

  const sortedHistoryDates = Object.keys(groupedPastAssignments).sort().reverse();

  const isToday = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  };

  const isPast = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  };

  const monthName = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const getClassName = (classId: string) => classes.find((c) => c.id === classId)?.name || 'Class';

  if (showHistory) {
    return (
      <div className="w-full space-y-4 md:space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-start gap-2 md:gap-3 mb-2">
              <Button
                onClick={() => setShowHistory(false)}
                variant="ghost"
                size="icon"
                className="rounded-lg h-9 w-9 flex-shrink-0 mt-0.5"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Activity History
              </h1>
            </div>
            <p className="text-sm md:text-base text-muted-foreground mt-2 ml-12 md:ml-0">
              Past assignment activity from live data
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 animate-spin" />
            <p className="text-sm md:text-base">Loading activity history...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            <p className="text-sm md:text-base">Failed to load calendar history</p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        ) : sortedHistoryDates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm md:text-base">No data present: calendar history</p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4 animate-stagger">
            {sortedHistoryDates.map((date, dateIdx) => (
              <div key={date} style={{ animation: `fade-in 0.4s ease-out ${dateIdx * 30}ms both` }}>
                <div className="mb-2 md:mb-3">
                  <h3 className="text-xs md:text-sm font-semibold flex items-center gap-2 text-muted-foreground px-1">
                    <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    <span className="text-xs md:text-sm">
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </h3>
                </div>
                <div className="space-y-2">
                  {groupedPastAssignments[date].map((assignment) => (
                    <Card key={assignment.id} className="border-0 shadow-sm card-interactive cursor-pointer hover:shadow-md transition-all">
                      <CardContent className="p-2 md:p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm md:text-base truncate">{assignment.title}</p>
                              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{getClassName(assignment.classId)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs capitalize">{assignment.status}</Badge>
                            <Badge variant="outline" className="text-xs">{assignment.points} pts</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Calendar
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">
            Track assignments, deadlines, and announcements in one place
          </p>
        </div>
        <Button
          onClick={() => setShowHistory(true)}
          variant="outline"
          className="w-full md:w-fit transition-all duration-300"
        >
          <Clock className="h-4 w-4 mr-2" />
          View History
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 md:gap-4">
        <Button
          onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
          variant="outline"
          size="icon"
          className="hover:bg-primary/10 transition-colors duration-200 h-9 w-9 md:h-10 md:w-10"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg md:text-2xl font-semibold text-primary text-center flex-1">
          {monthName}
        </h2>
        <Button
          onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
          variant="outline"
          size="icon"
          className="hover:bg-primary/10 transition-colors duration-200 h-9 w-9 md:h-10 md:w-10"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 animate-spin" />
          <p className="text-sm md:text-base">Loading calendar data...</p>
        </div>
      ) : error ? (
        <div className="text-center py-12 text-destructive">
          <p className="text-sm md:text-base">Failed to load calendar data</p>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      ) : (
        <>
          {allAssignments.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm md:text-base">No assignments yet for this month. The calendar is ready when data arrives.</p>
            </div>
          )}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50/80 via-white/95 to-blue-50/60 dark:from-slate-900/95 dark:via-slate-900/98 dark:to-slate-800/95 backdrop-blur-md overflow-hidden ring-1 ring-primary/5">
            <div className="p-3 md:p-6 lg:p-8">
              <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3 mb-2 md:mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs md:text-sm font-semibold text-muted-foreground py-2 md:py-3 border-b border-border/50"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3">
                {calendar.map((day, idx) => {
                  const dateStr = day.date.toISOString().split('T')[0];
                  const isCurrentDay = isToday(day.date);
                  const isPastDay = isPast(day.date);
                  const hasAssignments = day.assignments.length > 0;
                  const hasLateAssignments = day.assignments.some((a) => a.status === 'late');

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(day.date)}
                      className={`
                        relative aspect-square rounded-xl overflow-hidden
                        transition-all duration-300 transform
                        ${!day.isCurrentMonth ? 'opacity-40' : ''}
                        ${isCurrentDay
                          ? 'ring-2 ring-primary ring-offset-2 shadow-lg scale-105'
                          : 'hover:shadow-md hover:scale-[1.02]'
                        }
                        ${hasLateAssignments
                          ? 'bg-destructive/10 border-2 border-destructive/30'
                          : hasAssignments
                          ? 'bg-primary/5 border-2 border-primary/20'
                          : 'bg-secondary/30 border-2 border-transparent'
                        }
                        group cursor-pointer
                      `}
                      style={{
                        animation: `fade-in 0.4s ease-out ${idx * 20}ms both`,
                      }}
                    >
                      <div className="absolute top-1 right-1 md:top-2 md:right-2 lg:top-3 lg:right-3">
                        <span className={`
                          text-xs md:text-sm lg:text-base font-bold
                          ${isCurrentDay ? 'text-primary' : isPastDay ? 'text-muted-foreground' : 'text-foreground'}
                        `}>
                          {day.date.getDate()}
                        </span>
                      </div>

                      <div className="h-full flex flex-col p-1 md:p-2 lg:p-3 gap-0.5 md:gap-1">
                        {hasAssignments && (
                          <div className="flex items-start gap-0.5 flex-wrap">
                            {day.assignments.slice(0, 1).map((assignment) => (
                              <div
                                key={assignment.id}
                                className="text-xs md:text-xs font-semibold px-1 md:px-2 py-0.5 md:py-1 rounded-md bg-primary/80 text-primary-foreground line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                title={assignment.title}
                              >
                                {getClassName(assignment.classId).split(' ')[0]}
                              </div>
                            ))}
                            {day.assignments.length > 1 && (
                              <div className="text-xs md:text-xs font-semibold px-1 md:px-2 py-0.5 md:py-1 rounded-md bg-primary/60 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                +{day.assignments.length - 1}
                              </div>
                            )}
                          </div>
                        )}

                        {hasLateAssignments && (
                          <div className="flex items-center gap-0.5 mt-auto">
                            <AlertCircle className="h-2.5 w-2.5 md:h-3 md:w-3 text-destructive flex-shrink-0" />
                            <span className="text-xs font-semibold text-destructive">Late</span>
                          </div>
                        )}

                        {hasAssignments && !hasLateAssignments && (
                          <div className="text-xs text-muted-foreground font-medium mt-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            {day.assignments.length} item{day.assignments.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-3 md:gap-4 justify-center md:justify-start text-xs md:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-primary/20 border border-primary/40" />
              <span className="text-muted-foreground">Has Assignments</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-destructive/20 border border-destructive/40" />
              <span className="text-muted-foreground">Late</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full ring-2 ring-primary" />
              <span className="text-muted-foreground">Today</span>
            </div>
          </div>
        </>
      )}

      <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl">
              {selectedDate?.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </DialogTitle>
            <DialogDescription className="text-xs md:text-sm">
              {selectedDateAssignments.length === 0
                ? 'No assignments scheduled for this date'
                : `${selectedDateAssignments.length} item${selectedDateAssignments.length !== 1 ? 's' : ''} due`}
            </DialogDescription>
          </DialogHeader>

          {selectedDateAssignments.length > 0 && (
            <div className="space-y-3 md:space-y-4">
              {selectedDateAssignments.map((assignment, idx) => (
                <div
                  key={assignment.id}
                  className="p-3 md:p-4 rounded-xl border border-border/50 bg-gradient-to-br from-card to-secondary/30 hover:border-primary/50 transition-all duration-300 hover:shadow-md"
                  style={{
                    animation: `fade-in 0.4s ease-out ${idx * 100}ms both`,
                  }}
                >
                  <div className="flex flex-col gap-2 md:gap-3">
                    <div>
                      <h3 className="font-bold text-foreground text-base md:text-lg">{assignment.title}</h3>
                      <p className="text-xs md:text-sm text-muted-foreground">{getClassName(assignment.classId)}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge
                        variant={assignment.status === 'late' ? 'destructive' : 'secondary'}
                        className="capitalize font-semibold text-xs"
                      >
                        {assignment.status}
                      </Badge>
                      <Badge variant="outline" className="font-semibold text-xs">
                        {assignment.points} pts
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs md:text-sm text-muted-foreground mt-3">{assignment.description}</p>

                  <div className="flex items-center gap-2 md:gap-4 text-xs text-muted-foreground mt-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
                      <span className="font-semibold capitalize">{assignment.type}</span>
                    </span>
                    {assignment.attachments && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/50">
                        {assignment.attachments} file{assignment.attachments !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
