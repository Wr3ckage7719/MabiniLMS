import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CLASS_COLORS } from '@/lib/data';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useMaterials } from '@/hooks-api/useMaterials';
import { useClasses } from '@/hooks-api/useClasses';
import { useAnnouncements } from '@/hooks-api/useAnnouncements';
import { useStudents } from '@/hooks-api/useStudents';
import { useRole } from '@/contexts/RoleContext';
import { ArrowLeft, FileText, Zap, Calendar, MessageSquare, Users, Paperclip, LogOut, Trash2, Download, Book, File, Music, Image as ImageIcon, Archive, Loader2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AssignmentDetailDialog } from '@/components/AssignmentDetailDialog';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { StudentClassStream } from '@/components/StudentClassStream';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TYPE_ICONS: Record<string, typeof FileText> = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: MessageSquare,
};

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  image: ImageIcon,
  video: Music,
  presentation: Book,
  spreadsheet: FileText,
  archive: Archive,
};

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUserAvatar } = useRole();
  const [confirmAction, setConfirmAction] = useState<'archive' | 'unenroll' | null>(null);

  // Fetch real data from API
  const { data: classes = [], isLoading: classesLoading } = useClasses();
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments(id);
  const { data: materials = [], isLoading: materialsLoading } = useMaterials(id);
  const { data: announcements = [], isLoading: announcementsLoading } = useAnnouncements(id);
  const { data: students = [], isLoading: studentsLoading } = useStudents(id || '');
  const [selectedAssignment, setSelectedAssignment] = useState<typeof assignments[0] | null>(null);

  const cls = classes.find((c) => c.id === id);
  
  if (classesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading course...</p>
        </div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
        <div className="p-4 rounded-full bg-secondary/50 mb-4">
          <GraduationCap className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Course not found</h2>
        <p className="text-muted-foreground mb-4">The course you're looking for doesn't exist or you don't have access.</p>
        <Button onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const handleArchive = () => {
    navigate('/dashboard');
  };

  const handleUnenroll = () => {
    navigate('/dashboard');
  };

  return (
    <div className="animate-fade-in">
      {/* Banner */}
      <div className={`${CLASS_COLORS[cls.color]} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/30" />
        <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-white/10" />
        <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="relative z-10 p-4 md:p-6 lg:p-8 pb-8 md:pb-10">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/20 -ml-2 rounded-xl h-8 md:h-9"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white/80 hover:text-white hover:bg-white/20 rounded-lg h-8 w-8 md:h-9 md:w-9"
                >
                  <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem
                  onClick={() => setConfirmAction('archive')}
                  className="rounded-lg cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Archive Class
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfirmAction('unenroll')}
                  className="rounded-lg cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Unenroll
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white">{cls.name}</h1>
          <p className="text-xs md:text-sm text-white/80 mt-1">{cls.section} • {cls.teacher}</p>
          <p className="text-xs md:text-sm text-white/70 mt-1">{cls.room} • {cls.schedule}</p>
          <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-3">
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-xs md:text-sm">
              <Users className="h-3 w-3 mr-1" /> {cls.students} students
            </Badge>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/30 text-xs md:text-sm">
              Code: {cls.id.toUpperCase()}XK3
            </Badge>
          </div>
        </div>
      </div>

      <div className="p-3 md:p-6 lg:p-8 max-w-5xl mx-auto">
        <Tabs defaultValue="stream" className="space-y-4 md:space-y-6">
          <TabsList className="bg-secondary/50 p-0.5 md:p-1 rounded-lg md:rounded-xl w-full justify-start md:justify-center overflow-x-auto flex-nowrap scrollbar-hide">
            <TabsTrigger value="stream" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">Stream</TabsTrigger>
            <TabsTrigger value="materials" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">Materials</TabsTrigger>
            <TabsTrigger value="assignments" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">Assignments</TabsTrigger>
            <TabsTrigger value="people" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">People</TabsTrigger>
            <TabsTrigger value="grades" className="rounded-md md:rounded-lg data-[state=active]:shadow-sm text-xs md:text-sm px-2 md:px-3 py-1.5 md:py-2">Grades</TabsTrigger>
          </TabsList>

          {/* Stream */}
          <TabsContent value="stream" className="space-y-4 md:space-y-6">
            {/* Announcements Section */}
            {announcementsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : announcements.length > 0 ? (
              <div className="space-y-3 md:space-y-4">
                <h3 className="font-semibold text-sm md:text-base">Announcements</h3>
                {announcements.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 md:py-12 text-muted-foreground">
                <MessageSquare className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                <p className="text-sm md:text-base">No data present: announcements</p>
              </div>
            )}

            {/* Student Discussion Section */}
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-4">Class Discussion</h3>
              <StudentClassStream />
            </div>
          </TabsContent>

          {/* Materials */}
          <TabsContent value="materials" className="space-y-3 md:space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-0 mb-4 md:mb-6">
              <h3 className="font-semibold text-base md:text-lg">Learning Materials</h3>
              <Button variant="outline" size="sm" className="rounded-lg gap-2 w-full md:w-fit text-xs md:text-sm">
                <Download className="h-3.5 w-3.5 md:h-4 md:w-4" />
                Download All
              </Button>
            </div>
            {materialsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3 animate-stagger">
                {materials.map((material, idx) => {
                const Icon = FILE_TYPE_ICONS[material.fileType] || FileText;
                return (
                  <Card
                    key={material.id}
                    className="border-0 shadow-sm card-interactive cursor-pointer hover:shadow-md transition-all"
                    style={{
                      animation: `fade-in 0.4s ease-out ${idx * 50}ms both`,
                    }}
                  >
                    <CardContent className="p-3 md:p-4 lg:p-5">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 md:p-3 rounded-lg md:rounded-xl bg-primary/10 flex-shrink-0">
                            <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm md:text-base truncate">{material.title}</p>
                            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">{material.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg flex-shrink-0 h-8 w-8 md:h-9 md:w-9 hover:bg-primary/10"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-3 flex-wrap text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 text-xs">
                            {material.fileSize}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 capitalize text-xs">
                            {material.fileType}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md bg-secondary/50 text-xs">
                            <Download className="h-3 w-3" /> {material.downloads}
                          </span>
                          <span className="text-muted-foreground ml-auto text-xs hidden md:inline">
                            {material.uploadedBy}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {materials.length === 0 && (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <Book className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No materials uploaded yet</p>
                </div>
              )}
              </div>
            )}
          </TabsContent>

          {/* Assignments */}
          <TabsContent value="assignments" className="space-y-3 md:space-y-4">
            <h3 className="font-semibold text-sm md:text-base">All Assignments</h3>
            {assignmentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2 md:space-y-3 animate-stagger">
                {assignments.map((a) => {
                const Icon = TYPE_ICONS[a.type] || FileText;
                return (
                  <Card
                    key={a.id}
                    className="border-0 shadow-sm card-interactive cursor-pointer"
                    onClick={() => setSelectedAssignment(a)}
                  >
                    <CardContent className="p-3 md:p-4 flex flex-col md:flex-row md:items-center gap-3">
                      <div className={`p-2 md:p-3 rounded-lg md:rounded-xl flex-shrink-0 ${a.status === 'late' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                        <Icon className={`h-4 w-4 md:h-5 md:w-5 ${a.status === 'late' ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                        <p className="text-xs md:text-sm text-muted-foreground mt-0.5 truncate">{a.description}</p>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap md:shrink-0">
                        <div className="text-right">
                          <p className="text-xs md:text-sm font-medium">{a.points} pts</p>
                          <p className={`text-xs mt-0.5 ${a.status === 'late' ? 'text-destructive' : 'text-muted-foreground'}`}>
                            Due {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        {a.attachments && (
                          <Badge variant="secondary" className="text-xs">
                            <Paperclip className="h-3 w-3 mr-1" /> {a.attachments}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {assignments.length === 0 && (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No assignments yet</p>
                </div>
              )}
              </div>
            )}
          </TabsContent>

          {/* People */}
          <TabsContent value="people" className="space-y-4 md:space-y-6">
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-2 md:mb-3">Teacher</h3>
              <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg md:rounded-xl hover:bg-secondary/50 transition-colors">
                <Avatar className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs md:text-sm">
                    {cls.teacher.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm md:text-base truncate">{cls.teacher}</span>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base mb-2 md:mb-3">Students ({students.length})</h3>
              {studentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : students.length > 0 ? (
                <div className="space-y-1 animate-stagger">
                  {students.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg md:rounded-xl hover:bg-secondary/50 transition-colors">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 flex-shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs md:text-sm">{s.avatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs md:text-sm truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                  </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-12 text-muted-foreground">
                  <Users className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 md:mb-3 opacity-30" />
                  <p className="text-sm md:text-base">No data present: students</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Grades */}
          <TabsContent value="grades" className="space-y-4 md:space-y-6">
            <h3 className="font-semibold text-sm md:text-base">My Grades</h3>
            
            {/* Overall Grade Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <Card className="border-0 shadow-sm md:col-span-2">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12 md:h-14 md:w-14 flex-shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-base md:text-lg">{currentUserAvatar}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm md:text-base">Current Student</p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">No data present: profile grade data</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-0 shadow-sm flex items-center justify-center">
                <CardContent className="p-4 md:p-6 text-center w-full">
                  <p className="text-xs md:text-sm text-muted-foreground mb-2">Overall Grade</p>
                  <p className="text-4xl md:text-5xl font-bold text-primary">N/A</p>
                </CardContent>
              </Card>
            </div>

            {/* Assignment Grades */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 md:p-6">
                <h4 className="font-semibold text-sm md:text-base mb-4">Assignment Grades</h4>
                <div className="space-y-3 md:space-y-0 md:divide-y md:divide-border">
                  {assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 p-0 md:py-3 md:first:pt-0 md:last:pb-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm md:text-base truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Due {new Date(a.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <p className="font-semibold text-sm md:text-base flex-shrink-0">
                        {a.status === 'graded' ? `${Math.floor(a.points * 0.9)}/${a.points}` : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AssignmentDetailDialog
        assignment={selectedAssignment}
        open={!!selectedAssignment}
        onOpenChange={(open) => !open && setSelectedAssignment(null)}
        teacherName={cls.teacher}
      />

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'archive' ? 'Archive Class?' : 'Unenroll from Class?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'archive'
                ? `Are you sure you want to archive "${cls.name}"? You can view archived classes later.`
                : `Are you sure you want to unenroll from "${cls.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => (confirmAction === 'archive' ? handleArchive() : handleUnenroll())}
            className={`rounded-lg ${confirmAction === 'unenroll' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {confirmAction === 'archive' ? 'Archive' : 'Unenroll'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
