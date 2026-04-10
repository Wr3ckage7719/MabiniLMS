import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Clock, AlertCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentDetailDialogProps {
  student: {
    name: string;
    avatar: string;
    submitted: number;
    total: number;
    percentage: number;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompletedStudentItem {
  id: number;
  title: string;
  type: 'activity' | 'material';
  dueDate: string;
  timeSpent: number;
  grade?: string;
  submittedOn: string;
}

interface MissingStudentItem {
  id: number;
  title: string;
  type: 'activity' | 'material';
  dueDate: string;
  urgency: 'high' | 'medium' | 'low';
}

const STUDENT_ASSIGNMENT_DATA: {
  completed: CompletedStudentItem[];
  missing: MissingStudentItem[];
} = {
  completed: [],
  missing: [],
};

const formatTimeSpent = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
};

const getGradeColor = (grade: string) => {
  const numeric = parseInt(grade);
  if (numeric >= 90) return 'text-green-600';
  if (numeric >= 80) return 'text-blue-600';
  if (numeric >= 70) return 'text-orange-600';
  return 'text-red-600';
};

const getUrgencyColor = (urgency: string) => {
  if (urgency === 'high') return 'bg-red-50 border-red-200';
  if (urgency === 'medium') return 'bg-orange-50 border-orange-200';
  return 'bg-yellow-50 border-yellow-200';
};

export function StudentDetailDialog({
  student,
  open,
  onOpenChange,
}: StudentDetailDialogProps) {
  const gradedCompleted = STUDENT_ASSIGNMENT_DATA.completed.filter(
    (a): a is CompletedStudentItem & { grade: string } => Boolean(a.grade)
  );
  const avgGrade =
    gradedCompleted.length > 0
      ? gradedCompleted.reduce((sum, a) => sum + parseInt(a.grade, 10), 0) /
        gradedCompleted.length
      : 0;
  
  const totalMaterialTime = STUDENT_ASSIGNMENT_DATA.completed
    .filter((a) => a.type === 'material')
    .reduce((sum, a) => sum + a.timeSpent, 0);

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle>Student Profile</DialogTitle>
        </DialogHeader>

        {/* Student Header */}
        <div className="border-b border-muted pb-4 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {student.avatar}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{student.name}</h2>
                <p className="text-sm text-muted-foreground">Student</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Completion</p>
              <p className="text-lg font-bold text-blue-600">{student.percentage}%</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Submitted</p>
              <p className="text-lg font-bold text-green-600">
                {student.submitted}/{student.total}
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Avg Grade</p>
              <p className={`text-lg font-bold ${getGradeColor(avgGrade.toFixed(0))}`}>
                {avgGrade.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Watch Time</p>
              <p className="text-lg font-bold text-orange-600">{formatTimeSpent(totalMaterialTime)}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="completed" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-lg bg-muted p-1">
            <TabsTrigger value="completed" className="rounded-md text-sm">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed ({STUDENT_ASSIGNMENT_DATA.completed.length})
            </TabsTrigger>
            <TabsTrigger value="missing" className="rounded-md text-sm">
              <AlertCircle className="h-4 w-4 mr-2" />
              Missing ({STUDENT_ASSIGNMENT_DATA.missing.length})
            </TabsTrigger>
          </TabsList>

          {/* Completed Tab */}
          <TabsContent value="completed" className="space-y-3 mt-4">
            {STUDENT_ASSIGNMENT_DATA.completed.length > 0 ? (
              <div className="space-y-2">
                {STUDENT_ASSIGNMENT_DATA.completed.map((assignment) => (
                  <Card key={assignment.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                            <h3 className="font-medium text-sm line-clamp-1">{assignment.title}</h3>
                            <Badge
                              variant="outline"
                              className="text-xs rounded-full capitalize flex-shrink-0"
                            >
                              {assignment.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Due: {assignment.dueDate}</span>
                            <span>•</span>
                            <span>Submitted: {assignment.submittedOn}</span>
                          </div>
                        </div>
                        {assignment.type === 'material' ? (
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-muted-foreground mb-1">Watch Time</p>
                            <p className="text-lg font-bold text-orange-600 flex items-center justify-end gap-1">
                              <Clock className="h-4 w-4" />
                              {formatTimeSpent(assignment.timeSpent)}
                            </p>
                          </div>
                        ) : assignment.grade ? (
                          <div className="text-right flex-shrink-0">
                            <p className={`text-lg font-bold ${getGradeColor(assignment.grade)}`}>
                              {assignment.grade}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-muted-foreground text-sm">No completed assignments yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Missing Tab */}
          <TabsContent value="missing" className="space-y-3 mt-4">
            {STUDENT_ASSIGNMENT_DATA.missing.length > 0 ? (
              <div className="space-y-2">
                {STUDENT_ASSIGNMENT_DATA.missing.map((assignment) => (
                  <Card
                    key={assignment.id}
                    className={cn(
                      'border-0 shadow-sm hover:shadow-md transition-shadow',
                      getUrgencyColor(assignment.urgency)
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle
                              className={cn(
                                'h-4 w-4 flex-shrink-0',
                                assignment.urgency === 'high'
                                  ? 'text-red-600'
                                  : assignment.urgency === 'medium'
                                    ? 'text-orange-600'
                                    : 'text-yellow-600'
                              )}
                            />
                            <h3 className="font-medium text-sm line-clamp-1">{assignment.title}</h3>
                            <Badge
                              variant="outline"
                              className="text-xs rounded-full capitalize flex-shrink-0"
                            >
                              {assignment.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Due: {assignment.dueDate}</span>
                            {assignment.urgency === 'high' && (
                              <>
                                <span>•</span>
                                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs font-medium">
                                  Urgent
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="flex-shrink-0 rounded-lg">
                          Send Reminder
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-green-400 mb-2" />
                  <p className="text-muted-foreground text-sm">All caught up! No missing assignments</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="border-t border-muted pt-4 flex gap-2 justify-end mt-4">
          <Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="rounded-lg">Send Message</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
