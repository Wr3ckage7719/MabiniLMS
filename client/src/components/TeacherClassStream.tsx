import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Copy,
  Settings,
  Palette,
  Plus,
  Send,
  MoreVertical,
  Heart,
  MessageCircle,
  Repeat2,
  Sparkles,
  Clock,
  BookOpen,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { announcementsService, Announcement } from '@/services/announcements.service';
import { useToast } from '@/hooks/use-toast';

interface TeacherClassStreamProps {
  classId: string;
  className: string;
  classColor: string;
  section?: string;
  room?: string;
  schedule?: string;
}

export function TeacherClassStream({
  classId,
  className,
  classColor,
  section,
  room,
  schedule,
}: TeacherClassStreamProps) {
  const { toast } = useToast();
  const [announcementText, setAnnouncementText] = useState('');
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [classCode] = useState(classId.slice(0, 8).toUpperCase());
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(classColor);
  const [copied, setCopied] = useState(false);
  const [customBackgroundImage, setCustomBackgroundImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('stream');
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assignmentType, setAssignmentType] = useState<'activity' | 'material'>('activity');
  const [assignmentTopic, setAssignmentTopic] = useState('');
  const [topics, setTopics] = useState(['Functions', 'Derivatives', 'Integration']);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [assignments, setAssignments] = useState([
    {
      id: 1,
      title: 'Chapter 3: Functions & Graphs',
      description: 'Complete the exercises on pages 45-52 in your textbook',
      dueDate: 'Today',
      dueSoon: true,
      submitted: 18,
      total: 32,
      status: 'active',
      type: 'activity' as const,
      topic: 'Functions',
      createdAt: new Date(),
    },
    {
      id: 2,
      title: 'Practice Problem Set #5',
      description: 'Solve problems 1-20 from the worksheet provided in class',
      dueDate: 'Tomorrow',
      dueSoon: true,
      submitted: 5,
      total: 32,
      status: 'active',
      type: 'activity' as const,
      topic: 'Functions',
      createdAt: new Date(),
    },
    {
      id: 3,
      title: 'Quiz: Derivatives',
      description: 'Online quiz covering derivatives, integrals, and applications',
      dueDate: 'Mar 15',
      dueSoon: false,
      submitted: 32,
      total: 32,
      status: 'completed',
      type: 'activity' as const,
      topic: 'Derivatives',
      createdAt: new Date(),
    },
  ]);

  // Load announcements from API
  const loadAnnouncements = useCallback(async () => {
    try {
      setIsLoadingAnnouncements(true);
      const response = await announcementsService.getAnnouncements(classId);
      const apiAnnouncements = response.data?.map((a: Announcement) => ({
        id: a.id,
        classId: a.course_id,
        author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
        avatar: a.author?.first_name?.[0] || 'T',
        content: a.content,
        title: a.title,
        timestamp: new Date(a.created_at).toLocaleDateString(),
        comments: 0,
        pinned: a.pinned,
      })) || [];
      setAnnouncements(apiAnnouncements);
    } catch (error) {
      console.error('Failed to load announcements:', error);
      // Fallback to empty array on error
      setAnnouncements([]);
    } finally {
      setIsLoadingAnnouncements(false);
    }
  }, [classId]);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

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

  const handlePostAnnouncement = async () => {
    if (!announcementText.trim()) return;
    
    setIsPostingAnnouncement(true);
    try {
      await announcementsService.createAnnouncement(classId, {
        title: announcementText.slice(0, 100), // Use first 100 chars as title
        content: announcementText,
      });
      
      toast({
        title: 'Success',
        description: 'Announcement posted successfully',
      });
      
      setAnnouncementText('');
      // Reload announcements to get the new one with proper data
      await loadAnnouncements();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to post announcement',
        variant: 'destructive',
      });
    } finally {
      setIsPostingAnnouncement(false);
    }
  };

  const handleCreateAssignment = () => {
    if (assignmentTitle.trim() && assignmentDueDate.trim() && assignmentTopic) {
      const newAssignment = {
        id: Math.max(...assignments.map(a => a.id), 0) + 1,
        title: assignmentTitle,
        description: assignmentDescription,
        dueDate: assignmentDueDate,
        dueSoon: true,
        submitted: 0,
        total: 32,
        status: 'active',
        type: assignmentType,
        topic: assignmentTopic,
        createdAt: new Date(),
      };
      setAssignments([newAssignment, ...assignments]);
      setAssignmentTitle('');
      setAssignmentDescription('');
      setAssignmentDueDate('');
      setAssignmentType('activity');
      setAssignmentTopic('');
      setShowCreateAssignment(false);
    }
  };

  const handleCreateTopic = () => {
    if (newTopicName.trim() && !topics.includes(newTopicName)) {
      setTopics([...topics, newTopicName]);
      setAssignmentTopic(newTopicName);
      setNewTopicName('');
      setShowNewTopic(false);
    }
  };

  const handleDeleteAssignment = (id: number) => {
    setAssignments(assignments.filter(a => a.id !== id));
  };

  const getThemeColors = (color: string) => {
    const colors: Record<string, { bg: string; text: string; light: string }> = {
      blue: {
        bg: 'bg-blue-500',
        text: 'text-blue-500',
        light: 'bg-blue-50',
      },
      teal: {
        bg: 'bg-teal-500',
        text: 'text-teal-500',
        light: 'bg-teal-50',
      },
      purple: {
        bg: 'bg-purple-500',
        text: 'text-purple-500',
        light: 'bg-purple-50',
      },
      orange: {
        bg: 'bg-orange-500',
        text: 'text-orange-500',
        light: 'bg-orange-50',
      },
      pink: { bg: 'bg-pink-500', text: 'text-pink-500', light: 'bg-pink-50' },
      green: {
        bg: 'bg-green-500',
        text: 'text-green-500',
        light: 'bg-green-50',
      },
    };
    return colors[color] || colors.blue;
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
              {section && (
                <p className="text-white/80 text-sm">{section}</p>
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
                  <p className="text-lg font-bold text-blue-600">28</p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-50">
                  <p className="text-lg font-bold text-green-600">12</p>
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
                {announcements.length > 0 ? (
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
              <Dialog open={showCreateAssignment} onOpenChange={setShowCreateAssignment}>
                <DialogContent className="w-full max-w-md rounded-xl">
                  <DialogHeader>
                    <DialogTitle className="text-left">Create assignment</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {/* Type Selection */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">Type</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAssignmentType('activity')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                            assignmentType === 'activity'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          Activity
                        </button>
                        <button
                          onClick={() => setAssignmentType('material')}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                            assignmentType === 'material'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          Material
                        </button>
                      </div>
                    </div>

                    {/* Topic Selection */}
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">Topic</label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {topics.map((topic) => (
                            <button
                              key={topic}
                              onClick={() => setAssignmentTopic(topic)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                                assignmentTopic === topic
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {topic}
                            </button>
                          ))}
                          <button
                            onClick={() => setShowNewTopic(!showNewTopic)}
                            className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
                          >
                            + New
                          </button>
                        </div>
                        
                        {showNewTopic && (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Topic name..."
                              value={newTopicName}
                              onChange={(e) => setNewTopicName(e.target.value)}
                              className="rounded-lg text-xs"
                            />
                            <Button
                              size="sm"
                              onClick={handleCreateTopic}
                              disabled={!newTopicName.trim()}
                              className="rounded-lg"
                            >
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
                      <Input
                        placeholder="Assignment title..."
                        value={assignmentTitle}
                        onChange={(e) => setAssignmentTitle(e.target.value)}
                        className="rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Description</label>
                      <Textarea
                        placeholder="Add instructions or details..."
                        value={assignmentDescription}
                        onChange={(e) => setAssignmentDescription(e.target.value)}
                        className="min-h-20 resize-none rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Due Date</label>
                      <Input
                        placeholder="e.g., Tomorrow, Mar 15, etc."
                        value={assignmentDueDate}
                        onChange={(e) => setAssignmentDueDate(e.target.value)}
                        className="rounded-lg"
                      />
                    </div>
                  </div>

                  <DialogFooter className="flex gap-2 justify-end pt-4">
                    <Button 
                      variant="ghost" 
                      onClick={() => setShowCreateAssignment(false)}
                      className="rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleCreateAssignment}
                      disabled={!assignmentTitle.trim() || !assignmentDueDate.trim() || !assignmentTopic}
                      className="rounded-lg"
                    >
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

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
                              <DropdownMenuItem>Edit</DropdownMenuItem>
                              <DropdownMenuItem>View Submissions</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDeleteAssignment(item.id)}
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
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground font-medium">People coming soon</p>
              </CardContent>
            </Card>
          )}

          {/* Recent Submissions Tab Content */}
          {activeTab === 'submissions' && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground font-medium">Recent submissions coming soon</p>
              </CardContent>
            </Card>
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
    </div>
  );
}
