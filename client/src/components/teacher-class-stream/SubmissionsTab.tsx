import { Clock, Download } from 'lucide-react';
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
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl rounded-xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Student Submission</DialogTitle>
          </DialogHeader>

          {selectedSubmission && (() => {
            // Parse quiz result JSON if content is a quiz blob
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

            return (
              <div className="space-y-6">
                {/* Student header */}
                <div className="border-b border-muted pb-4">
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {selectedSubmission.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{selectedSubmission.student}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge className={selectedSubmission.onTime ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                          {selectedSubmission.onTime ? 'On Time' : 'Late'}
                        </Badge>
                        <Badge variant="outline" className={statusInfo.className}>
                          {statusInfo.label}
                        </Badge>
                        {typeLabel && (
                          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">
                            {typeLabel}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">Submitted: {selectedSubmission.submittedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Assignment details */}
                  <div className="space-y-3 bg-blue-50 rounded-lg p-3 mt-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">ASSIGNMENT</p>
                      <p className="font-semibold text-sm">{selectedSubmission.assignment}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">DUE DATE</p>
                      <p className="text-sm">{selectedSubmission.dueDate}</p>
                    </div>
                    {selectedSubmission.points != null && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">POINTS POSSIBLE</p>
                        <p className="text-sm font-bold text-blue-600">{selectedSubmission.points} pts</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submission content — type-aware */}
                <div>
                  <h4 className="font-semibold text-sm mb-3">Student's Submission</h4>
                  <Card className="border-0 shadow-sm bg-muted/50">
                    <CardContent className="p-4">
                      {quizResult ? (
                        // Quiz score card
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">Score</span>
                            <span className="text-lg font-bold text-blue-600">
                              {quizResult.raw_score ?? quizResult.scaled_score ?? '—'} / {quizResult.max_question_score ?? quizResult.total_questions ?? '—'}
                            </span>
                          </div>
                          {quizResult.answered_count != null && quizResult.total_questions != null && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Questions answered</span>
                              <span>{quizResult.answered_count} / {quizResult.total_questions}</span>
                            </div>
                          )}
                          {quizResult.violation_count != null && (
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Violations detected</span>
                              <span className={quizResult.violation_count > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                {quizResult.violation_count}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : selectedSubmission.submissionContent ? (
                        // Plain text submission
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
                          {selectedSubmission.submissionContent}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No text submission.</p>
                      )}

                      {/* File attachment — only if there's an actual file to open */}
                      {selectedSubmission.submissionUrl && selectedSubmission.providerFileName && (
                        <div className="mt-4 rounded-lg border border-border bg-background p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              {selectedSubmission.providerLabel || 'Attached File'}
                            </p>
                            <a
                              href={selectedSubmission.submissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary underline truncate block"
                            >
                              {selectedSubmission.providerFileName}
                            </a>
                            {(selectedSubmission.providerMimeType || selectedSubmission.providerSizeBytes) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {[
                                  selectedSubmission.providerMimeType || null,
                                  formatProviderFileSize(selectedSubmission.providerSizeBytes),
                                ].filter(Boolean).join(' • ')}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Grading section */}
                <div className="space-y-4">
                  {selectedSubmission.gradedAt && (
                    <p className="text-xs text-muted-foreground">
                      Last graded: {new Date(selectedSubmission.gradedAt).toLocaleString()}
                    </p>
                  )}
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Grade</label>
                    <Input
                      placeholder="e.g., 95/100 or 95"
                      value={submissionGrade}
                      onChange={(e) => setSubmissionGrade(e.target.value)}
                      className="rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Feedback</label>
                    <Textarea
                      placeholder="Provide constructive feedback for the student..."
                      value={submissionFeedback}
                      onChange={(e) => setSubmissionFeedback(e.target.value)}
                      className="min-h-24 rounded-lg resize-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
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
                    onClick={handleSaveSubmissionGrade}
                    disabled={savingSubmissionGrade || !submissionGrade.trim()}
                  >
                    {savingSubmissionGrade ? 'Saving...' : 'Save Grade & Feedback'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
