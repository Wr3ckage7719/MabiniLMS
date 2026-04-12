import { useEffect, useState } from 'react';
import {
  Users,
  Search,
  MoreVertical,
  Mail,
  MessageSquare,
  Download,
  ArrowUpDown,
  Clock,
  Check,
} from 'lucide-react';
import { Student } from '@/lib/data';
import { useClasses } from '@/contexts/ClassesContext';
import { InviteStudentDialog } from '@/components/InviteStudentDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useStudents } from '@/hooks-api/useStudents';
import { useWeightedCourseGrade } from '@/hooks-api/useGrades';
import { useCourseSubmissions } from '@/hooks/useTeacherData';

type SortOption = 'name' | 'submissions';

interface TeacherClassPeopleProps {
  classId: string;
}

export function TeacherClassPeople({ classId }: TeacherClassPeopleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const {
    getClassInvitations,
    getPendingInvitations,
    refreshInvitations,
    invitationsLoading,
  } = useClasses();
  const { data: students = [], isLoading: studentsLoading } = useStudents(classId);
  const { submissions, loading: submissionsLoading } = useCourseSubmissions(classId);

  useEffect(() => {
    void refreshInvitations(classId);
  }, [classId, refreshInvitations]);

  const classInvitations = getClassInvitations(classId);
  const pendingInvitations = getPendingInvitations(classId);
  const acceptedInvitations = classInvitations.filter((invitation) => invitation.status === 'accepted');

  const getDisplaySubmissions = (studentId: string) => {
    return submissions
      .filter((submission) => submission.student_id === studentId)
      .map((submission) => ({
        id: submission.id,
        assignmentTitle: submission.assignment?.title || 'Assignment',
        submittedDate: new Date(submission.submitted_at).toLocaleString(),
        grade:
          typeof submission.grade?.points_earned === 'number'
            ? String(submission.grade.points_earned)
            : undefined,
        status: submission.grade ? 'graded' : 'submitted',
      }));
  };

  if (studentsLoading || submissionsLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading students...
        </CardContent>
      </Card>
    );
  }

  // Count submissions per student
  const getStudentSubmissionCount = (studentId: string) => {
    return submissions.filter((submission) => submission.student_id === studentId).length;
  };

  const getStudentSubmissions = (studentId: string) => {
    return getDisplaySubmissions(studentId);
  };

  // Filter and sort students
  const filteredStudents = students.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (sortBy === 'submissions') {
    filteredStudents.sort(
      (a, b) =>
        getStudentSubmissionCount(b.id) - getStudentSubmissionCount(a.id)
    );
  } else if (sortBy === 'name') {
    filteredStudents.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-lg"
          />
        </div>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
          <SelectTrigger className="w-full sm:w-40 rounded-lg">
            <ArrowUpDown className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by Name</SelectItem>
            <SelectItem value="submissions">Sort by Submissions</SelectItem>
          </SelectContent>
        </Select>

        {/* Invite Student Button */}
        <Button
          onClick={() => setInviteDialogOpen(true)}
          className="rounded-lg w-full sm:w-auto bg-primary hover:bg-primary/90"
        >
          <Mail className="h-4 w-4 mr-2" />
          Enroll by Email
        </Button>
      </div>

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-amber-600" />
              Pending Invitations ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-100 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">{invitation.studentEmail}</span>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 rounded-full">
                    Pending
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {invitationsLoading && classInvitations.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading invitations...</p>
      )}

      {/* Recently Joined Section */}
      {acceptedInvitations.length > 0 && (
        <Card className="border-0 shadow-sm bg-green-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-5 w-5 text-green-600" />
              Recently Joined ({acceptedInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acceptedInvitations
                .map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-green-100 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-muted-foreground">{invitation.studentEmail}</span>
                    </div>
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 rounded-full">
                      Joined
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Students List */}
      {filteredStudents.length > 0 ? (
        <>
          <h3 className="font-semibold text-sm">Students ({filteredStudents.length})</h3>
          <div className="space-y-2 animate-stagger">
          {filteredStudents.map((student, idx) => {
            const submissionCount = getStudentSubmissionCount(student.id);
            const submissions = getStudentSubmissions(student.id);

            return (
              <Card
                key={student.id}
                className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer"
                style={{
                  animation: `fade-in 0.4s ease-out ${idx * 40}ms both`,
                }}
              >
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center justify-between gap-4">
                    {/* Student Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        {student.avatarUrl ? (
                          <AvatarImage src={student.avatarUrl} alt={`${student.name} avatar`} />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                          {student.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p
                          className="font-semibold text-sm hover:text-primary transition-colors cursor-pointer"
                          onClick={() => setSelectedStudent(student)}
                        >
                          {student.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {student.email}
                        </p>
                      </div>
                    </div>

                    {/* Submission Count */}
                    <div className="hidden sm:flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Submissions:</span>
                      <Badge variant="outline" className="rounded-full">
                        {submissionCount}
                      </Badge>
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
                        <DropdownMenuItem
                          onClick={() => setSelectedStudent(student)}
                          className="cursor-pointer"
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          View Submissions
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer">
                          <Download className="h-4 w-4 mr-2" />
                          Download Work
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>


                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-3 opacity-50" />
            <p className="text-muted-foreground">
              No students found matching your search.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Invite Student Dialog */}
      <InviteStudentDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        classId={classId}
      />

      {/* Student Details Dialog */}
      <StudentDetailsDialog
        student={selectedStudent}
        classId={classId}
        getStudentSubmissions={getStudentSubmissions}
        onClose={() => {
          setSelectedStudent(null);
        }}
      />
    </div>
  );
}

interface StudentDetailDialogProps {
  student: Student | null;
  classId: string;
  getStudentSubmissions: (studentId: string) => Array<{
    id: string;
    assignmentTitle: string;
    submittedDate: string;
    grade?: string;
    status: 'submitted' | 'graded';
  }>;
  onClose: () => void;
}

function StudentDetailsDialog({
  student,
  classId,
  getStudentSubmissions,
  onClose,
}: StudentDetailDialogProps) {

  const weightedGradeQuery = useWeightedCourseGrade(classId, student?.id, {
    enabled: Boolean(student?.id),
  });

  if (!student) return null;

  const submissions = getStudentSubmissions(student.id);
  const weightedBreakdown = weightedGradeQuery.data;

  return (
    <Dialog open={!!student} onOpenChange={onClose}>
      <DialogContent className="rounded-xl max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {student.avatarUrl ? (
                <AvatarImage src={student.avatarUrl} alt={`${student.name} avatar`} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {student.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle>{student.name}</DialogTitle>
              <DialogDescription>{student.email}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Weighted Standing */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Current Standing (40/30/30)</CardTitle>
            </CardHeader>
            <CardContent>
              {weightedGradeQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading weighted grade...</p>
              ) : weightedBreakdown ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Final Grade</span>
                    <span className="font-semibold">
                      {weightedBreakdown.final_percentage.toFixed(2)}% ({weightedBreakdown.letter_grade})
                    </span>
                  </div>

                  {(['exam', 'quiz', 'activity'] as const).map((categoryKey) => {
                    const category = weightedBreakdown.categories[categoryKey];
                    const label =
                      categoryKey === 'exam'
                        ? 'Exam'
                        : categoryKey === 'quiz'
                          ? 'Quiz'
                          : 'Activity';

                    return (
                      <div key={categoryKey} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{label} ({Math.round(category.weight * 100)}%)</span>
                          <span className="font-semibold">+{category.weighted_contribution.toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {category.graded_count}/{category.assignment_total} graded
                          {typeof category.raw_percentage === 'number'
                            ? ` • ${category.raw_percentage.toFixed(2)}%`
                            : ' • Not graded yet'}
                        </p>
                      </div>
                    );
                  })}

                  <p className="text-xs text-muted-foreground">
                    Missing categories currently contribute 0 until graded.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No weighted grade data available yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Submissions */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                Submissions ({submissions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {submissions.length > 0 ? (
                <div className="space-y-2">
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {submission.assignmentTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Submitted {submission.submittedDate}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {submission.grade && (
                          <Badge variant="outline" className="rounded-full">
                            {submission.grade}%
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`rounded-full text-xs ${
                            submission.status === 'graded'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {submission.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No submissions yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
