import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Copy,
  Palette,
  Plus,
  Send,
  MoreVertical,
  Heart,
  MessageCircle,
  Repeat2,
  Clock,
  BookOpen,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CreateAssignmentDialog } from '@/components/CreateAssignmentDialog';
import { TeacherAssignmentDetail } from '@/components/TeacherAssignmentDetail';
import { StudentDetailDialog } from '@/components/StudentDetailDialog';
import { TeacherClassPeople } from '@/components/TeacherClassPeople';
import { useAnnouncements } from '@/hooks-api/useAnnouncements';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useCourseSubmissions } from '@/hooks/useTeacherData';
import { announcementsService } from '@/services/announcements.service';
import { assignmentsService } from '@/services/assignments.service';
import { useToast } from '@/hooks/use-toast';

interface TeacherClassStreamProps {
  classId: string;
  className: string;
  classColor: string;
  block?: string;
  level?: string;
  room?: string;
  schedule?: string;
}

interface ClassworkAssignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  dueSoon: boolean;
  submitted: number;
  total: number;
  status: 'active' | 'completed';
  type: 'activity' | 'material';
  rawType?: string;
  topic?: string;
  createdAt: Date;
}

interface RecentSubmissionItem {
  id: string;
  student: string;
  avatar: string;
  assignment: string;
  submittedAt: string;
  dueDate: string;
  onTime: boolean;
  submissionContent?: string;
  points?: number;
  description?: string;
}

export function TeacherClassStream({
  classId,
  className,
  classColor,
  block,
  level,
  room,
  schedule,
}: TeacherClassStreamProps) {
  const [announcementText, setAnnouncementText] = useState('');
  const { toast } = useToast();
  const {
    data: apiAnnouncements = [],
    isLoading: announcementsLoading,
    refetch: refetchAnnouncements,
  } = useAnnouncements(classId);
  const { data: apiAssignments = [] } = useAssignments(classId);
  const { submissions: apiSubmissions = [] } = useCourseSubmissions(classId);
  const [announcements, setAnnouncements] = useState(apiAnnouncements);
  const [classCode] = useState(() => classId.toUpperCase().slice(0, 8));
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(classColor);
  const [copied, setCopied] = useState(false);
  const [customBackgroundImage, setCustomBackgroundImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('stream');
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<ClassworkAssignment | null>(null);
  const [showAssignmentDetail, setShowAssignmentDetail] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<{
    name: string;
    avatar: string;
    submitted: number;
    total: number;
    percentage: number;
  } | null>(null);
  const [showStudentDetail, setShowStudentDetail] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<RecentSubmissionItem | null>(null);
  const [showSubmissionDetail, setShowSubmissionDetail] = useState(false);
  const [submissionGrade, setSubmissionGrade] = useState('');
  const [submissionFeedback, setSubmissionFeedback] = useState('');
  const [assignments, setAssignments] = useState<ClassworkAssignment[]>([]);

  useEffect(() => {
    setAnnouncements(apiAnnouncements);
  }, [apiAnnouncements]);

  useEffect(() => {
    const assignmentSubmissions = apiSubmissions.reduce<Record<string, number>>((acc, submission) => {
      acc[submission.assignment_id] = (acc[submission.assignment_id] || 0) + 1;
      return acc;
    }, {});

    const mappedAssignments: ClassworkAssignment[] = apiAssignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      points: assignment.points,
      dueSoon: new Date(assignment.dueDate).getTime() - Date.now() <= 48 * 60 * 60 * 1000,
      submitted: assignmentSubmissions[assignment.id] || 0,
      total: Math.max(assignmentSubmissions[assignment.id] || 0, 1),
      status: assignment.status === 'graded' ? 'completed' : 'active',
      type: assignment.type === 'discussion' ? 'material' : 'activity',
      rawType: assignment.rawType,
      createdAt: new Date(assignment.dueDate),
    }));

    setAssignments(mappedAssignments);
  }, [apiAssignments, apiSubmissions]);

  const recentSubmissions: RecentSubmissionItem[] = useMemo(() => {
    return apiSubmissions
      .map((submission) => {
        const firstName = submission.student?.first_name?.trim() || '';
        const lastName = submission.student?.last_name?.trim() || '';
        const studentName = `${firstName} ${lastName}`.trim() || submission.student?.email || 'Student';
        const avatar = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || studentName.slice(0, 2).toUpperCase();

        return {
          id: submission.id,
          student: studentName,
          avatar,
          assignment: submission.assignment?.title || 'Assignment',
          submittedAt: new Date(submission.submitted_at).toLocaleString(),
          dueDate: submission.assignment?.due_date ? new Date(submission.assignment.due_date).toLocaleDateString() : 'No due date',
          onTime: submission.assignment?.due_date
            ? new Date(submission.submitted_at).getTime() <= new Date(submission.assignment.due_date).getTime()
            : true,
          points: submission.assignment?.max_points,
          submissionContent: submission.submission_text || submission.submission_url || undefined,
          description: submission.assignment?.title,
        };
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
      .slice(0, 10);
  }, [apiSubmissions]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomBackgroundImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const copyClassCode = () => {
    navigator.clipboard.writeText(classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePostAnnouncement = () => {
    const content = announcementText.trim();
    if (!content) return;

    void (async () => {
      try {
        await announcementsService.createAnnouncement(classId, {
          title: content.slice(0, 80),
          content,
        });
        setAnnouncementText('');
        await refetchAnnouncements();
        toast({
          title: 'Announcement posted',
          description: 'Your announcement is now visible to students.',
        });
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || 'Failed to post announcement';
        toast({
          title: 'Unable to post announcement',
          description: message,
          variant: 'destructive',
        });
      }
    })();
  };

  const handleDeleteAssignment = (id: string) => {
    void (async () => {
      try {
        await assignmentsService.deleteAssignment(classId, id);
        setAssignments(assignments.filter((assignment) => assignment.id !== id));
        toast({
          title: 'Classwork removed',
          description: 'The selected classwork item has been deleted.',
        });
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || 'Failed to delete classwork';
        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive',
        });
      }
    })();
  };

  const gradients: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    teal: 'from-teal-500 to-teal-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    pink: 'from-pink-500 to-pink-600',
    green: 'from-green-500 to-green-600',
    cyan: 'from-cyan-500 to-cyan-600',
    indigo: 'from-indigo-500 to-indigo-600',
    gray: 'from-gray-400 to-gray-500',
  };

  const currentGradient = gradients[selectedTheme] || gradients.blue;

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Theme Banner */}
      <div 
        className={`relative rounded-xl overflow-hidden mb-6 shadow-lg transition-all duration-500 ease-out ${!customBackgroundImage ? `bg-gradient-to-br ${currentGradient}` : ''}`}
        style={{
          animation: 'slideInTop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          backgroundImage: customBackgroundImage ? `url(${customBackgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 opacity-10"></div>
        </div>
        {/* Dark overlay for custom images to ensure text readability */}
        {customBackgroundImage && (
          <div className="absolute inset-0 bg-black/40"></div>
        )}
        
        <div className="relative p-6 md:p-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">{className}</h2>
              {block && level && (
                <p className="text-white/80 text-sm">Block {block} • {level}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowThemeSettings(!showThemeSettings)}
              className="text-white hover:bg-white/20 rounded-lg h-10 w-10"
            >
              <Palette className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-white/90">
            {room && (
              <div>
                <p className="text-xs text-white/70 mb-1">Room</p>
                <p className="font-semibold text-sm">{room}</p>
              </div>
            )}
            {schedule && (
              <div>
                <p className="text-xs text-white/70 mb-1">Schedule</p>
                <p className="font-semibold text-sm">{schedule}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6">
        <div className="flex gap-1 md:gap-6">
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'stream'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Stream
          </button>
          <button
            onClick={() => setActiveTab('classwork')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'classwork'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Classwork
          </button>
          <button
            onClick={() => setActiveTab('people')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'people'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            People
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-1 md:px-2 py-3 font-medium text-sm transition-colors ${
              activeTab === 'submissions'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Recent Submissions
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          {/* Class Code Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class Code</span>
                <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={copyClassCode} />
              </div>
              <div className="bg-muted rounded-lg p-4 text-center group">
                <p className="font-mono text-xl font-bold tracking-wider group-hover:scale-105 transition-transform">{classCode}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-3 rounded-lg text-xs"
                onClick={copyClassCode}
              >
                <Copy className="h-3 w-3 mr-1.5" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </CardContent>
          </Card>

          {/* Upcoming Card */}
          <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Upcoming
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center py-6">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No work due soon</p>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs text-primary hover:bg-blue-50 rounded-lg">
                View all
              </Button>
            </CardContent>
          </Card>

          {/* Quick Statistics */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-2 rounded-lg bg-blue-50">
                  <p className="text-lg font-bold text-blue-600">
                    {new Set(recentSubmissions.map((item) => item.student)).size}
                  </p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-50">
                  <p className="text-lg font-bold text-green-600">
                    {assignments.filter((item) => item.status === 'active').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Theme Customization Dialog */}
          <Dialog open={showThemeSettings} onOpenChange={setShowThemeSettings}>
            <DialogContent className="w-full max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="text-left">Customize appearance</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Stream Header Image Preview */}
                <div className="space-y-2">
                  <div 
                    className={`relative rounded-lg overflow-hidden h-24 shadow-sm ${!customBackgroundImage ? `bg-gradient-to-br ${currentGradient}` : ''}`}
                    style={{
                      backgroundImage: customBackgroundImage ? `url(${customBackgroundImage})` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}>
                    {customBackgroundImage && (
                      <div className="absolute inset-0 bg-black/20"></div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Select stream header image</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg text-xs">
                      <Copy className="h-3 w-3 mr-1.5" />
                      Select photo
                    </Button>
                    <label htmlFor="bg-upload-modal">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-lg text-xs cursor-pointer"
                        onClick={(e) => e.preventDefault()}
                      >
                        <Upload className="h-3 w-3 mr-1.5" />
                        Upload photo
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="bg-upload-modal"
                      />
                    </label>
                  </div>
                </div>

                {/* Theme Colors */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Select theme color</p>
                  <div className="flex gap-4 justify-center flex-wrap">
                    {[
                      { name: 'blue', bg: 'bg-blue-500' },
                      { name: 'green', bg: 'bg-green-500' },
                      { name: 'pink', bg: 'bg-pink-500' },
                      { name: 'orange', bg: 'bg-orange-500' },
                      { name: 'cyan', bg: 'bg-cyan-500' },
                      { name: 'purple', bg: 'bg-purple-500' },
                      { name: 'indigo', bg: 'bg-indigo-500' },
                      { name: 'gray', bg: 'bg-gray-400' },
                    ].map((color) => (
                      <button
                        key={color.name}
                        onClick={() => {
                          setSelectedTheme(color.name);
                          setCustomBackgroundImage(null);
                        }}
                        className={`h-10 w-10 rounded-full transition-all duration-300 ${color.bg} ${
                          selectedTheme === color.name && !customBackgroundImage
                            ? 'ring-2 ring-offset-2 ring-primary scale-110'
                            : 'hover:scale-110 shadow-sm'
                        }`}
                      >
                        {selectedTheme === color.name && !customBackgroundImage && (
                          <div className="h-full w-full flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full border-2 border-white flex items-center justify-center">
                              <div className="h-2 w-2 bg-white rounded-full"></div>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex gap-2 justify-end pt-4">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowThemeSettings(false)}
                  className="rounded-lg"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => setShowThemeSettings(false)}
                  className="rounded-lg"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Stream Tab Content */}
          {activeTab === 'stream' && (
            <>
              {/* Announcement Composer */}
              <Card className="border-0 shadow-md hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Post an Announcement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Share important updates, reminders, or information with your class..."
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.target.value)}
                    className="min-h-20 resize-none rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      onClick={handlePostAnnouncement}
                      disabled={!announcementText.trim()}
                      className="rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Post
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Announcements List */}
              <div className="space-y-4">
                {announcementsLoading ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center text-muted-foreground">
                      Loading announcements...
                    </CardContent>
                  </Card>
                ) : announcements.length > 0 ? (
                  <div className="space-y-3">
                    {announcements.map((announcement, idx) => (
                      <Card
                        key={announcement.id}
                        className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                        style={{
                          animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                        }}
                      >
                        <CardContent className="p-4 md:p-5">
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-blue-100/50 group-hover:ring-blue-200 transition-all">
                                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white font-semibold text-sm">
                                    {announcement.avatar}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-semibold text-sm group-hover:text-primary transition-colors">{announcement.author}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {announcement.timestamp}
                                  </p>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-lg">
                                  <DropdownMenuItem>Edit</DropdownMenuItem>
                                  <DropdownMenuItem>Pin to Top</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive">
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Content */}
                            <p className="text-sm leading-relaxed text-foreground/90">{announcement.content}</p>

                            {/* Actions */}
                            <div className="flex gap-4 pt-2 border-t border-muted opacity-70 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                              >
                                <Heart className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">Like</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-all"
                              >
                                <MessageCircle className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">{announcement.comments}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg text-muted-foreground hover:text-green-500 hover:bg-green-50 transition-all"
                              >
                                <Repeat2 className="h-4 w-4 mr-1.5" />
                                <span className="text-xs">Share</span>
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                      <div className="mb-4 flex justify-center">
                        <div className="rounded-full bg-blue-100 p-4">
                          <Bell className="h-8 w-8 text-blue-500" />
                        </div>
                      </div>
                      <p className="text-muted-foreground font-medium">
                        No announcements yet.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Post one to get started!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}

          {/* Classwork Tab Content */}
          {activeTab === 'classwork' && (
            <div className="space-y-4">
              {/* Create Assignment Dialog */}
              <CreateAssignmentDialog
                open={showCreateAssignment}
                onOpenChange={setShowCreateAssignment}
                classId={classId}
              />

              {/* Create Classwork Button */}
              <div className="flex justify-end">
                <Button 
                  onClick={() => setShowCreateAssignment(true)}
                  className="rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300">
                  <Plus className="h-4 w-4 mr-2" />
                  Create assignment
                </Button>
              </div>

              {/* Classwork Items */}
              <div className="space-y-3">
                {assignments.length > 0 ? (
                  assignments.map((item, idx) => (
                    <Card
                      key={item.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group cursor-pointer"
                      onClick={() => {
                        setSelectedAssignment(item);
                        setShowAssignmentDetail(true);
                      }}
                      style={{
                        animation: `slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both`,
                      }}
                    >
                      <CardContent className="p-4 md:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {item.title}
                              </h3>
                              {item.dueSoon && (
                                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs font-medium rounded-full">
                                  Due Soon
                                </Badge>
                              )}
                              {item.status === 'completed' && (
                                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs font-medium rounded-full">
                                  Done
                                </Badge>
                              )}
                            </div>
                            
                            {/* Description */}
                            {item.description && (
                              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                            
                            <p className="text-xs text-muted-foreground mb-3 font-medium">Due: {item.dueDate}</p>
                            
                            {/* Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {item.submitted} of {item.total} submitted
                                </p>
                                <p className="text-xs font-medium text-primary">
                                  {Math.round((item.submitted / item.total) * 100)}%
                                </p>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                                  style={{ width: `${(item.submitted / item.total) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>

                          {/* Action Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-all rounded-lg flex-shrink-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-lg">
                              <DropdownMenuItem 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAssignment(item);
                                  setShowAssignmentDetail(true);
                                }}
                              >
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAssignment(item.id);
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                      <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-muted-foreground font-medium">No assignments yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Create one to get started</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* People Tab Content */}
          {activeTab === 'people' && (
            <TeacherClassPeople classId={classId} />
          )}

          {/* Recent Submissions Tab Content */}
          {activeTab === 'submissions' && (
            <>
              {recentSubmissions.length > 0 ? (
                <div className="space-y-3">
                  {recentSubmissions.map((submission) => (
                    <Card key={submission.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <Avatar className="h-10 w-10 flex-shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {submission.avatar}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-sm">{submission.student}</p>
                                <Badge className={submission.onTime ? 'bg-green-100 text-green-700 border-green-200 text-xs' : 'bg-red-100 text-red-700 border-red-200 text-xs'}>
                                  {submission.onTime ? 'On Time' : 'Late'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">{submission.assignment}</p>
                              <p className="text-xs text-muted-foreground">Submitted: {submission.submittedAt}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 rounded-lg"
                            onClick={() => {
                              setSelectedSubmission(submission);
                              setShowSubmissionDetail(true);
                              setSubmissionGrade('');
                              setSubmissionFeedback('');
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-12 text-center">
                    <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground font-medium">No recent submissions yet</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInTop {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>

      {/* Teacher Assignment Detail Dialog */}
      {selectedAssignment && (
        <TeacherAssignmentDetail
          assignment={selectedAssignment ? {
            id: String(selectedAssignment.id),
            title: selectedAssignment.title,
            description: selectedAssignment.description,
            dueDate: selectedAssignment.dueDate,
            points: selectedAssignment.points,
            type: selectedAssignment.type,
            rawType: selectedAssignment.rawType,
            topics: selectedAssignment.topic ? [{ id: '1', name: selectedAssignment.topic }] : [],
            acceptingSubmissions: selectedAssignment.status === 'active',
          } : null}
          open={showAssignmentDetail}
          onOpenChange={(open) => {
            setShowAssignmentDetail(open);
            if (!open) setSelectedAssignment(null);
          }}
        />
      )}

      {/* Student Detail Dialog */}
      <StudentDetailDialog
        student={selectedStudent}
        open={showStudentDetail}
        onOpenChange={(open) => {
          setShowStudentDetail(open);
          if (!open) setSelectedStudent(null);
        }}
      />

      {/* Submission Detail Dialog */}
      <Dialog open={showSubmissionDetail} onOpenChange={setShowSubmissionDetail}>
        <DialogContent className="w-full max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Submission</DialogTitle>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-6">
              {/* Student & Assignment Info */}
              <div className="border-b border-muted pb-4">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {selectedSubmission.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{selectedSubmission.student}</h3>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge className={selectedSubmission.onTime ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                        {selectedSubmission.onTime ? 'On Time' : 'Late'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Submitted: {selectedSubmission.submittedAt}</span>
                    </div>
                  </div>
                </div>

                {/* Assignment Details */}
                <div className="space-y-3 bg-blue-50 rounded-lg p-3 mt-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">ASSIGNMENT</p>
                    <p className="font-semibold text-sm">{selectedSubmission.assignment}</p>
                  </div>
                  {selectedSubmission.description && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">INSTRUCTIONS</p>
                      <p className="text-xs text-foreground/80">{selectedSubmission.description}</p>
                    </div>
                  )}
                  {selectedSubmission.points && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">POINTS</p>
                      <p className="text-sm font-bold text-blue-600">{selectedSubmission.points} points</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submission Content */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Student's Submission</h4>
                <Card className="border-0 shadow-sm bg-muted/50">
                  <CardContent className="p-4">
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                      {selectedSubmission.submissionContent || 'No submission content available yet from backend.'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Grade Input */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Grade</label>
                <Input
                  placeholder="e.g., 95/100 or 95"
                  value={submissionGrade}
                  onChange={(e) => setSubmissionGrade(e.target.value)}
                  className="rounded-lg"
                />
              </div>

              {/* Feedback Input */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Feedback</label>
                <Textarea
                  placeholder="Provide constructive feedback for the student..."
                  value={submissionFeedback}
                  onChange={(e) => setSubmissionFeedback(e.target.value)}
                  className="min-h-24 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex gap-2 justify-end pt-4 border-t border-muted">
                <Button 
                  variant="outline" 
                  className="rounded-lg"
                  onClick={() => setShowSubmissionDetail(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="rounded-lg"
                  onClick={() => {
                    // Handle saving grade and feedback
                    setShowSubmissionDetail(false);
                    setSubmissionGrade('');
                    setSubmissionFeedback('');
                  }}
                >
                  Save Grade & Feedback
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
