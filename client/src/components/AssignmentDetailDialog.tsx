import { useState } from 'react';
import { Assignment } from '@/lib/data';
import { useRole } from '@/contexts/RoleContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { FileText, Zap, Calendar, MessageSquare, Paperclip, Send, Clock, CheckCircle2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TYPE_ICONS: Record<string, typeof FileText> = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: MessageSquare,
};

interface Submission {
  id: string;
  content: string;
  timestamp: string;
  status: 'submitted' | 'graded';
  grade?: string;
  feedback?: string;
}

interface AssignmentDetailDialogProps {
  assignment: Assignment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherName: string;
}

export function AssignmentDetailDialog({ assignment, open, onOpenChange, teacherName }: AssignmentDetailDialogProps) {
  const { currentUserAvatar } = useRole();
  const [submissionText, setSubmissionText] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([
    { id: '1', content: 'Here is my completed work for this assignment. I followed all the guidelines.', timestamp: 'Apr 1, 2026 at 3:45 PM', status: 'graded', grade: '92/100', feedback: 'Great work! Consider expanding your analysis in section 3.' },
    { id: '2', content: 'Updated submission with revised section 3 as suggested.', timestamp: 'Apr 2, 2026 at 10:20 AM', status: 'submitted' },
  ]);
  const [comments, setComments] = useState([
    { id: '1', author: teacherName, avatar: 'SC', content: 'Remember to show all your work and cite any references.', timestamp: '2 days ago' },
    { id: '2', author: 'Kaide Olfindo', avatar: 'KO', content: 'Can we use external sources for this?', timestamp: '1 day ago' },
    { id: '3', author: teacherName, avatar: 'SC', content: 'Yes, but make sure to cite them properly in APA format.', timestamp: '1 day ago' },
  ]);
  const [newComment, setNewComment] = useState('');

  if (!assignment) return null;
  const Icon = TYPE_ICONS[assignment.type] || FileText;

  const handleSubmit = () => {
    if (!submissionText.trim()) return;
    setSubmissions(prev => [...prev, {
      id: String(prev.length + 1),
      content: submissionText,
      timestamp: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      status: 'submitted',
    }]);
    setSubmissionText('');
  };

  const handleComment = () => {
    if (!newComment.trim()) return;
    setComments(prev => [...prev, {
      id: String(prev.length + 1),
      author: 'Kaide Olfindo',
      avatar: currentUserAvatar,
      content: newComment,
      timestamp: 'Just now',
    }]);
    setNewComment('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-dvw sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-3 sm:p-6">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className={`p-2.5 sm:p-3 rounded-xl flex-shrink-0 ${assignment.status === 'late' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${assignment.status === 'late' ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg break-words">{assignment.title}</DialogTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">{teacherName} • {assignment.points} points</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
            <Calendar className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">Due </span>{new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Badge>
          <Badge variant={assignment.status === 'late' ? 'destructive' : 'secondary'} className="rounded-lg capitalize text-xs sm:text-sm">
            {assignment.status}
          </Badge>
          {assignment.attachments && (
            <Badge variant="secondary" className="rounded-lg text-xs sm:text-sm whitespace-nowrap">
              <Paperclip className="h-3 w-3 mr-1" /> {assignment.attachments}
            </Badge>
          )}
        </div>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="bg-secondary/50 p-1 rounded-xl w-full overflow-x-auto flex">
            <TabsTrigger value="details" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">Details</TabsTrigger>
            <TabsTrigger value="comments" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">
              <span className="hidden sm:inline">Comments</span><span className="sm:hidden">Cmnts</span> ({comments.length})
            </TabsTrigger>
            <TabsTrigger value="submissions" className="rounded-lg flex-1 text-xs sm:text-sm data-[state=active]:shadow-sm">
              <span className="hidden sm:inline">My Submissions</span><span className="sm:hidden">Submit</span> ({submissions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-3 sm:space-y-4 mt-4">
            <div>
              <h4 className="font-semibold text-xs sm:text-sm mb-2">Instructions</h4>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{assignment.description}</p>
            </div>
            <div>
              <h4 className="font-semibold text-xs sm:text-sm mb-2">Guidelines</h4>
              <ul className="text-xs sm:text-sm text-muted-foreground space-y-1 sm:space-y-1.5 list-disc pl-4">
                <li>Submit your work before the deadline</li>
                <li>Follow the formatting requirements outlined in class</li>
                <li>Original work only — cite all references properly</li>
                <li>Late submissions will receive a 10% penalty per day</li>
              </ul>
            </div>
            <Card className="border-0 shadow-sm bg-primary/5">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">SC</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-xs sm:text-sm">{teacherName}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                      Please reach out during office hours if you have questions. Good luck!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="pt-2">
              <h4 className="font-semibold text-xs sm:text-sm mb-2">Submit Your Work</h4>
              <Textarea
                value={submissionText}
                onChange={(e) => setSubmissionText(e.target.value)}
                placeholder="Paste your work or describe your submission..."
                className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[100px] text-sm"
              />
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 mt-3">
                <Button variant="ghost" size="sm" className="rounded-lg text-muted-foreground text-xs sm:text-sm">
                  <Paperclip className="h-4 w-4 mr-1" /> Attach files
                </Button>
                <Button size="sm" className="rounded-xl text-xs sm:text-sm" disabled={!submissionText.trim()} onClick={handleSubmit}>
                  <Send className="h-4 w-4 mr-1" /> Submit
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comments" className="space-y-3 mt-4">
            <div className="space-y-2 sm:space-y-3 max-h-[300px] overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 sm:gap-3 items-start">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">{c.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 bg-secondary/30 rounded-lg sm:rounded-xl p-2 sm:p-3 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-medium text-xs sm:text-sm truncate">{c.author}</span>
                      <span className="text-xs text-muted-foreground">{c.timestamp}</span>
                    </div>
                    <p className="text-xs sm:text-sm mt-1 break-words">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 flex-col sm:flex-row">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="rounded-xl border-0 bg-secondary/50 resize-none min-h-[60px] flex-1 text-sm"
              />
              <Button size="icon" className="rounded-xl self-end" disabled={!newComment.trim()} onClick={handleComment}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-2 sm:space-y-3 mt-4">
            {submissions.map((s) => (
              <Card key={s.id} className="border-0 shadow-sm">
                <CardContent className="p-2 sm:p-4">
                  <div className="flex flex-col gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div className="flex items-center gap-2">
                      {s.status === 'graded' ? (
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium capitalize">{s.status}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="text-xs text-muted-foreground">{s.timestamp}</span>
                      {s.grade && <Badge variant="secondary" className="text-xs w-fit">{s.grade}</Badge>}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-2 break-words">{s.content}</p>
                  {s.feedback && (
                    <div className="p-2 sm:p-3 bg-primary/5 rounded-lg">
                      <p className="text-xs font-medium text-primary mb-1">Teacher Feedback</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">{s.feedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {submissions.length === 0 && (
              <p className="text-center text-muted-foreground py-6 text-xs sm:text-sm">No submissions yet</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
