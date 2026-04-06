import { useState } from 'react';
import {
  Users,
  Search,
  MoreVertical,
  Mail,
  MessageSquare,
  Edit2,
  Download,
  ArrowUpDown,
} from 'lucide-react';
import { mockStudents, mockStudentSubmissions } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

type SortOption = 'name' | 'submissions' | 'grade';

interface TeacherClassPeopleProps {
  classId: string;
}

export function TeacherClassPeople({ classId }: TeacherClassPeopleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [selectedStudent, setSelectedStudent] = useState<(typeof mockStudents)[0] | null>(null);
  const [editingGrade, setEditingGrade] = useState<string | null>(null);

  // Count submissions per student
  const getStudentSubmissionCount = (studentId: string) => {
    return mockStudentSubmissions.filter(
      (s) => s.classId === classId && s.studentName === mockStudents.find(st => st.id === studentId)?.name
    ).length;
  };

  const getStudentSubmissions = (studentId: string) => {
    const studentName = mockStudents.find(st => st.id === studentId)?.name;
    return mockStudentSubmissions.filter(
      (s) => s.classId === classId && s.studentName === studentName
    );
  };

  // Filter and sort students
  let filteredStudents = mockStudents.filter((student) =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (sortBy === 'submissions') {
    filteredStudents.sort(
      (a, b) =>
        getStudentSubmissionCount(b.id) - getStudentSubmissionCount(a.id)
    );
  } else if (sortBy === 'grade') {
    filteredStudents.sort((a, b) => {
      const gradeOrder: Record<string, number> = {
        'A+': 10,
        A: 9,
        'A-': 8,
        'B+': 7,
        B: 6,
        'B-': 5,
        'C+': 4,
        C: 3,
        'C-': 2,
        D: 1,
        F: 0,
      };
      return (gradeOrder[b.grade || 'F'] || 0) - (gradeOrder[a.grade || 'F'] || 0);
    });
  } else if (sortBy === 'name') {
    filteredStudents.sort((a, b) => a.name.localeCompare(b.name));
  }

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'bg-green-50 text-green-700 border-green-200';
    if (grade.startsWith('B')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (grade.startsWith('C')) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (grade.startsWith('D')) return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{mockStudents.length}</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Average Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {mockStudents.length > 0
                ? Math.round(
                    mockStudentSubmissions.filter((s) => s.classId === classId)
                      .length / mockStudents.length
                  )
                : 0}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Class Average Grade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {mockStudents.length > 0 ? 'B+' : 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

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
            <SelectItem value="grade">Sort by Grade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Students List */}
      {filteredStudents.length > 0 ? (
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

                    {/* Grade */}
                    <div className="hidden md:block">
                      <Badge
                        variant="outline"
                        className={`rounded-full font-semibold ${getGradeColor(student.grade || 'N/A')}`}
                      >
                        {student.grade || 'N/A'}
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
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedStudent(student);
                            setEditingGrade(student.id);
                          }}
                          className="cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit Grade
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="cursor-pointer">
                          <Mail className="h-4 w-4 mr-2" />
                          Send Email
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer">
                          <Download className="h-4 w-4 mr-2" />
                          Download Work
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Mobile Grade Display */}
                  <div className="md:hidden mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Submissions: {submissionCount} | Grade:
                    </span>
                    <Badge
                      variant="outline"
                      className={`rounded-full font-semibold ${getGradeColor(student.grade || 'N/A')}`}
                    >
                      {student.grade || 'N/A'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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

      {/* Student Details Dialog */}
      <StudentDetailsDialog
        student={selectedStudent}
        classId={classId}
        onClose={() => {
          setSelectedStudent(null);
          setEditingGrade(null);
        }}
        isEditingGrade={editingGrade === selectedStudent?.id}
        onEditGrade={() => selectedStudent && setEditingGrade(selectedStudent.id)}
      />
    </div>
  );
}

interface StudentDetailDialogProps {
  student: (typeof mockStudents)[0] | null;
  classId: string;
  onClose: () => void;
  isEditingGrade: boolean;
  onEditGrade: () => void;
}

function StudentDetailsDialog({
  student,
  classId,
  onClose,
  isEditingGrade,
  onEditGrade,
}: StudentDetailDialogProps) {
  const [newGrade, setNewGrade] = useState(student?.grade || '');

  if (!student) return null;

  const submissions = mockStudentSubmissions.filter(
    (s) => s.classId === classId && s.studentName === student.name
  );

  return (
    <Dialog open={!!student} onOpenChange={onClose}>
      <DialogContent className="rounded-xl max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
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
          {/* Grade Section */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Current Grade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Overall Grade:</span>
                {isEditingGrade ? (
                  <Select value={newGrade} onValueChange={setNewGrade}>
                    <SelectTrigger className="w-24 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B">B</SelectItem>
                      <SelectItem value="B-">B-</SelectItem>
                      <SelectItem value="C+">C+</SelectItem>
                      <SelectItem value="C">C</SelectItem>
                      <SelectItem value="D">D</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant="outline"
                    className="rounded-full font-semibold text-base px-3"
                  >
                    {student.grade || 'N/A'}
                  </Badge>
                )}
              </div>
              {isEditingGrade ? (
                <div className="flex gap-2">
                  <Button size="sm" className="rounded-lg">
                    Save Grade
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => setNewGrade(student.grade || '')}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={onEditGrade}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Grade
                </Button>
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
