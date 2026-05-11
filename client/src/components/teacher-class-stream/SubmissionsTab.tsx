import { CalendarDays, Clock, Download, FileText, Target } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatProviderFileSize } from '@/lib/submission-storage';

export interface RecentSubmissionItem {
  id: string;
  student: string;
  avatar: string;
  assignment: string;
  assignmentType?: string;
  submittedAt: string;
  submittedAtValue: string;
  dueDate: string;
  onTime: boolean;
  submissionStatus: string;
  submissionContent?: string;
  submissionUrl?: string;
  providerLabel?: string;
  providerFileName?: string;
  providerMimeType?: string;
  providerSizeBytes?: number;
  existingGrade?: number | null;
  existingFeedback?: string | null;
  gradeId?: string | null;
  gradedAt?: string | null;
  points?: number;
}

interface SubmissionsTabProps {
  recentSubmissions: RecentSubmissionItem[];
  exportingRegistrar: boolean;
  handleExportRegistrar: () => void;
  showSubmissionDetail: boolean;
  setShowSubmissionDetail: (v: boolean) => void;
  selectedSubmission: RecentSubmissionItem | null;
  setSelectedSubmission: (v: RecentSubmissionItem | null) => void;
  submissionGrade: string;
  setSubmissionGrade: (v: string) => void;
  submissionFeedback: string;
  setSubmissionFeedback: (v: string) => void;
  savingSubmissionGrade: boolean;
  handleSaveSubmissionGrade: () => void;
}

export function SubmissionsTab({
  recentSubmissions,
  exportingRegistrar,
  handleExportRegistrar,
  showSubmissionDetail,
  setShowSubmissionDetail,
  selectedSubmission,
  setSelectedSubmission,
  submissionGrade,
  setSubmissionGrade,
  submissionFeedback,
  setSubmissionFeedback,
  savingSubmissionGrade,
  handleSaveSubmissionGrade,
}: SubmissionsTabProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-muted-foreground">Recent Submissions</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg text-xs gap-1.5"
          onClick={handleExportRegistrar}
          disabled={exportingRegistrar}
        >
          <Download className="h-3.5 w-3.5" />
          {exportingRegistrar ? 'Exporting…' : 'Registrar XLSX'}
        </Button>
      </div>
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
                      {submission.providerFileName && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {submission.providerLabel || 'Submitted file'}: {submission.providerFileName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 rounded-lg"
                    onClick={() => {
                      setSelectedSubmission(submission);
                      setShowSubmissionDetail(true);
                      setSubmissionGrade(
                        submission.existingGrade !== null && submission.existingGrade !== undefined
                          ? String(submission.existingGrade)
                          : ''
                      );
                      setSubmissionFeedback(submission.existingFeedback || '');
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

      {/* Submission Detail Dialog */}
      <Dialog open={showSubmissionDetail} onOpenChange={setShowSubmissionDetail}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-3xl rounded-xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
          {selectedSubmission && (() => {
            let quizResult: { raw_score?: number; max_question_score?: number; total_questions?: number; answered_count?: number; scaled_score?: number; violation_count?: number } | null = null;
            if (selectedSubmission.submissionContent) {
              try {
                const parsed = JSON.parse(selectedSubmission.submissionContent);
                if (parsed && typeof parsed === 'object' && ('raw_score' in parsed || 'scaled_score' in parsed)) {
                  quizResult = parsed;
                }
              } catch {
                // not JSON — plain text submission
              }
            }

            const statusConfig: Record<string, { label: string; className: string }> = {
              submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-700 border-blue-200' },
              under_review: { label: 'Under Review', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
              graded: { label: 'Graded', className: 'bg-green-100 text-green-700 border-green-200' },
              returned: { label: 'Returned', className: 'bg-purple-100 text-purple-700 border-purple-200' },
              late: { label: 'Late', className: 'bg-red-100 text-red-700 border-red-200' },
              draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600 border-gray-200' },
            };
            const statusInfo = statusConfig[selectedSubmission.submissionStatus] ?? { label: selectedSubmission.submissionStatus, className: 'bg-gray-100 text-gray-600 border-gray-200' };

            const typeLabels: Record<string, string> = {
              quiz: 'Quiz',
              exam: 'Exam',
              activity: 'Activity',
              material: 'Material',
              discussion: 'Discussion',
            };
            const typeLabel = selectedSubmission.assignmentType ? (typeLabels[selectedSubmission.assignmentType] ?? selectedSubmission.assignmentType) : null;

            const autoScoreRaw = quizResult?.raw_score ?? quizResult?.scaled_score ?? null;
            const autoScoreMax = quizResult?.max_question_score ?? quizResult?.total_questions ?? null;
            const autoScorePct =
              typeof autoScoreRaw === 'number' && typeof autoScoreMax === 'number' && autoScoreMax > 0
                ? Math.round((autoScoreRaw / autoScoreMax) * 100)
                : null;

            return (
              <>
                {/* Compact header — student identity + status in one row */}
                <DialogHeader className="px-5 pt-5 pb-3 border-b">
                  <div className="flex items-center gap-3 pr-8">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {selectedSubmission.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-base font-semibold truncate">
                        {selectedSubmission.student}
                      </DialogTitle>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <Badge className={`text-[10px] py-0 px-1.5 h-5 ${selectedSubmission.onTime ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                          {selectedSubmission.onTime ? 'On Time' : 'Late'}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-5 ${statusInfo.className}`}>
                          {statusInfo.label}
                        </Badge>
                        {typeLabel && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-5 bg-slate-100 text-slate-600 border-slate-200">
                            {typeLabel}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">• {selectedSubmission.submittedAt}</span>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="px-5 py-4 space-y-4">
                  {/* Assignment meta — single compact row instead of stacked labels */}
                  <div className="grid grid-cols-3 gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                        <FileText className="h-3 w-3" /> Assignment
                      </div>
                      <p className="text-xs font-semibold text-foreground truncate" title={selectedSubmission.assignment}>
                        {selectedSubmission.assignment}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                        <CalendarDays className="h-3 w-3" /> Due
                      </div>
                      <p className="text-xs text-foreground truncate" title={selectedSubmission.dueDate}>
                        {selectedSubmission.dueDate}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                        <Target className="h-3 w-3" /> Max
                      </div>
                      <p className="text-xs font-bold text-blue-600">
                        {selectedSubmission.points != null ? `${selectedSubmission.points} pts` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Submission content */}
                  {quizResult ? (
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Auto-Graded Result
                        </span>
                        <span className="text-base font-bold text-blue-600">
                          {autoScoreRaw ?? '—'} / {autoScoreMax ?? '—'}
                          {autoScorePct != null && (
                            <span className="text-xs font-medium text-muted-foreground ml-1.5">({autoScorePct}%)</span>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        {quizResult.answered_count != null && quizResult.total_questions != null && (
                          <div className="flex items-center justify-between rounded bg-background px-2 py-1.5">
                            <span className="text-muted-foreground">Answered</span>
                            <span className="font-semibold">{quizResult.answered_count} / {quizResult.total_questions}</span>
                          </div>
                        )}
                        {quizResult.violation_count != null && (
                          <div className="flex items-center justify-between rounded bg-background px-2 py-1.5">
                            <span className="text-muted-foreground">Violations</span>
                            <span className={quizResult.violation_count > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                              {quizResult.violation_count}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : selectedSubmission.submissionContent ? (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                        Student's Submission
                      </p>
                      <Card className="border bg-muted/30 shadow-none">
                        <CardContent className="p-3">
                          <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words">
                            {selectedSubmission.submissionContent}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : !selectedSubmission.submissionUrl && (
                    <p className="text-xs text-muted-foreground italic">No text submission.</p>
                  )}

                  {/* File attachment — compact inline pill */}
                  {selectedSubmission.submissionUrl && selectedSubmission.providerFileName && (
                    <a
                      href={selectedSubmission.submissionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border bg-background p-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary truncate">
                          {selectedSubmission.providerFileName}
                        </p>
                        {(selectedSubmission.providerMimeType || selectedSubmission.providerSizeBytes) && (
                          <p className="text-[10px] text-muted-foreground">
                            {[
                              selectedSubmission.providerLabel,
                              selectedSubmission.providerMimeType || null,
                              formatProviderFileSize(selectedSubmission.providerSizeBytes),
                            ].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                    </a>
                  )}

                  {/* Grading — grade input and feedback */}
                  <div className="rounded-lg border bg-card p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Teacher Grade
                      </p>
                      {selectedSubmission.gradedAt && (
                        <p className="text-[10px] text-muted-foreground">
                          Last saved {new Date(selectedSubmission.gradedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={submissionGrade}
                        onChange={(e) => setSubmissionGrade(e.target.value)}
                        className="rounded-lg h-9 w-24 text-base font-semibold text-center"
                      />
                      <span className="text-sm text-muted-foreground">
                        / {selectedSubmission.points ?? '—'} pts
                      </span>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1.5">
                        Feedback
                      </label>
                      <Textarea
                        placeholder="Add feedback for the student (optional)…"
                        value={submissionFeedback}
                        onChange={(e) => setSubmissionFeedback(e.target.value)}
                        className="min-h-16 rounded-lg resize-none text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Sticky footer actions */}
                <div className="sticky bottom-0 flex gap-2 justify-end px-5 py-3 border-t bg-background">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setShowSubmissionDetail(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-lg"
                    onClick={handleSaveSubmissionGrade}
                    disabled={savingSubmissionGrade || !submissionGrade.trim()}
                  >
                    {savingSubmissionGrade ? 'Saving…' : 'Save Grade'}
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
