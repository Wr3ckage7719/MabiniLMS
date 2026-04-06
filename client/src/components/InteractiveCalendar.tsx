import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { mockAssignments, mockClasses } from '@/lib/data';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  assignments: typeof mockAssignments;
}

export default function InteractiveCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 3, 1)); // April 2026
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

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

  const selectedDateAssignments = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = selectedDate.toISOString().split('T')[0];
    return mockAssignments.filter(a => a.dueDate === dateStr);
  }, [selectedDate]);

  const monthName = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

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

  const sortedHistoryDates = Object.keys(groupedPastAssignments).sort().reverse();

  if (showHistory) {
    return (
      <div className="w-full space-y-4 md:space-y-6 animate-fade-in">
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
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Activity History
              </h1>
            </div>
            <p className="text-sm md:text-base text-muted-foreground mt-2 ml-12 md:ml-0">All past assignments and completed activities</p>
          </div>
          <Button
            onClick={() => setShowHistory(false)}
            variant="default"
            className="w-full md:w-fit transition-all duration-300"
          >
            <Clock className="h-4 w-4 mr-2" />
            Current Calendar
          </Button>
        </div>

        {/* History List */}
        <div className="space-y-3 md:space-y-4 animate-stagger">
          {sortedHistoryDates.map((date, dateIdx) => (
            <div key={date} style={{ animation: `fade-in 0.4s ease-out ${dateIdx * 30}ms both` }}>
              <div className="mb-2 md:mb-3">
                <h3 className="text-xs md:text-sm font-semibold flex items-center gap-2 text-muted-foreground px-1">
                  <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  <span className="text-xs md:text-sm">{new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </h3>
              </div>
              <div className="space-y-2">
                {groupedPastAssignments[date].map((a, assignIdx) => {
                  const cls = mockClasses.find(c => c.id === a.classId);
                  return (
                    <Card
                      key={a.id}
                      className="border-0 shadow-sm card-interactive cursor-pointer hover:shadow-md transition-all"
                      style={{
                        animation: `fade-in 0.3s ease-out ${(dateIdx * 30) + (assignIdx * 50)}ms both`,
                      }}
                    >
                      <CardContent className="p-2 md:p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{cls?.name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs capitalize">{a.status}</Badge>
                            <Badge variant="outline" className="text-xs">{a.points} pts</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
          {sortedHistoryDates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm md:text-base">No past activities yet</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Calendar
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Track assignments, deadlines, and announcements in one place</p>
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
          onClick={previousMonth}
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
          onClick={nextMonth}
          variant="outline"
          size="icon"
          className="hover:bg-primary/10 transition-colors duration-200 h-9 w-9 md:h-10 md:w-10"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50/80 via-white/95 to-blue-50/60 dark:from-slate-900/95 dark:via-slate-900/98 dark:to-slate-800/95 backdrop-blur-md overflow-hidden ring-1 ring-primary/5">
        <div className="p-3 md:p-6 lg:p-8">
          {/* Weekday Headers */}
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

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3">
            {calendar.map((day, idx) => {
              const dateStr = day.date.toISOString().split('T')[0];
              const isCurrentDay = isToday(day.date);
              const isPastDay = isPast(day.date);
              const hasAssignments = day.assignments.length > 0;
              const hasLateAssignments = day.assignments.some(a => a.status === 'late');

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
                  {/* Day Number */}
                  <div className="absolute top-1 right-1 md:top-2 md:right-2 lg:top-3 lg:right-3">
                    <span className={`
                      text-xs md:text-sm lg:text-base font-bold
                      ${isCurrentDay ? 'text-primary' : isPastDay ? 'text-muted-foreground' : 'text-foreground'}
                    `}>
                      {day.date.getDate()}
                    </span>
                  </div>

                  {/* Content Area */}
                  <div className="h-full flex flex-col p-1 md:p-2 lg:p-3 gap-0.5 md:gap-1">
                    {/* Activity Indicators */}
                    {hasAssignments && (
                      <div className="flex items-start gap-0.5 flex-wrap">
                        {day.assignments.slice(0, 1).map((assignment, i) => {
                          const cls = mockClasses.find(c => c.id === assignment.classId);
                          return (
                            <div
                              key={`${assignment.id}-${i}`}
                              className="text-xs md:text-xs font-semibold px-1 md:px-2 py-0.5 md:py-1 rounded-md bg-primary/80 text-primary-foreground line-clamp-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                              title={assignment.title}
                            >
                              {cls?.name.split(' ')[0]}
                            </div>
                          );
                        })}
                        {day.assignments.length > 1 && (
                          <div className="text-xs md:text-xs font-semibold px-1 md:px-2 py-0.5 md:py-1 rounded-md bg-primary/60 text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            +{day.assignments.length - 1}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Late Indicator */}
                    {hasLateAssignments && (
                      <div className="flex items-center gap-0.5 mt-auto">
                        <AlertCircle className="h-2.5 w-2.5 md:h-3 md:w-3 text-destructive flex-shrink-0" />
                        <span className="text-xs font-semibold text-destructive">Late</span>
                      </div>
                    )}

                    {/* Assignment Count */}
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

      {/* Legend */}
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

      {/* Selected Date Details Modal */}
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
              {selectedDateAssignments.map((assignment, idx) => {
                const cls = mockClasses.find(c => c.id === assignment.classId);
                return (
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
                        <p className="text-xs md:text-sm text-muted-foreground">{cls?.name}</p>
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
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
