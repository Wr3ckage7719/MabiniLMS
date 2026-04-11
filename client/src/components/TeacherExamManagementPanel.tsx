import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  examsService,
  ExamQuestion,
  ExamViolation,
} from '@/services/exams.service';
import { useToast } from '@/hooks/use-toast';

interface TeacherExamManagementPanelProps {
  assignmentId: string;
  active: boolean;
}

interface QuestionDraft {
  prompt: string;
  choicesText: string;
  correctChoiceIndex: string;
  points: string;
  explanation: string;
  orderIndex: string;
}

const DEFAULT_DRAFT: QuestionDraft = {
  prompt: '',
  choicesText: '',
  correctChoiceIndex: '0',
  points: '1',
  explanation: '',
  orderIndex: '0',
};

const formatViolationType = (value: string): string => {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const buildDraftFromQuestion = (question: ExamQuestion): QuestionDraft => {
  return {
    prompt: question.prompt,
    choicesText: question.choices.join('\n'),
    correctChoiceIndex: String(question.correct_choice_index),
    points: String(question.points),
    explanation: question.explanation || '',
    orderIndex: String(question.order_index),
  };
};

const parseDraft = (
  draft: QuestionDraft
):
  | {
      payload: {
        prompt: string;
        choices: string[];
        correct_choice_index: number;
        points: number;
        explanation?: string;
        order_index: number;
      };
      error?: undefined;
    }
  | {
      payload?: undefined;
      error: string;
    } => {
  const prompt = draft.prompt.trim();
  if (!prompt) {
    return { error: 'Question prompt is required.' };
  }

  const choices = draft.choicesText
    .split('\n')
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);

  if (choices.length < 2) {
    return { error: 'Provide at least two answer choices (one per line).' };
  }

  const correctChoiceIndex = Number.parseInt(draft.correctChoiceIndex, 10);
  if (!Number.isInteger(correctChoiceIndex) || correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
    return {
      error: `Correct choice index must be between 0 and ${choices.length - 1}.`,
    };
  }

  const points = Number.parseFloat(draft.points);
  if (!Number.isFinite(points) || points <= 0) {
    return { error: 'Points must be a positive number.' };
  }

  const orderIndex = Number.parseInt(draft.orderIndex, 10);
  if (!Number.isInteger(orderIndex) || orderIndex < 0) {
    return { error: 'Order index must be 0 or greater.' };
  }

  const explanation = draft.explanation.trim();

  return {
    payload: {
      prompt,
      choices,
      correct_choice_index: correctChoiceIndex,
      points,
      explanation: explanation || undefined,
      order_index: orderIndex,
    },
  };
};

export function TeacherExamManagementPanel({
  assignmentId,
  active,
}: TeacherExamManagementPanelProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [violations, setViolations] = useState<ExamViolation[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestionDraft>(DEFAULT_DRAFT);

  const loadQuestions = useCallback(async () => {
    if (!assignmentId) return;

    setLoadingQuestions(true);
    try {
      const response = await examsService.listExamQuestions(assignmentId);
      setQuestions(response);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load exam questions';
      toast({
        title: 'Unable to load questions',
        description: message,
        variant: 'destructive',
      });
      setQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  }, [assignmentId, toast]);

  const loadViolations = useCallback(async () => {
    if (!assignmentId) return;

    setLoadingViolations(true);
    try {
      const response = await examsService.listAssignmentViolations(assignmentId, {
        limit: 50,
        offset: 0,
      });
      setViolations(response.violations);
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to load proctoring violations';
      toast({
        title: 'Unable to load violations',
        description: message,
        variant: 'destructive',
      });
      setViolations([]);
    } finally {
      setLoadingViolations(false);
    }
  }, [assignmentId, toast]);

  useEffect(() => {
    if (!active || !assignmentId) return;
    void Promise.all([loadQuestions(), loadViolations()]);
  }, [active, assignmentId, loadQuestions, loadViolations]);

  const groupedViolations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const violation of violations) {
      counts.set(violation.violation_type, (counts.get(violation.violation_type) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [violations]);

  const resetDraft = () => {
    setDraft(DEFAULT_DRAFT);
    setEditingQuestionId(null);
  };

  const handleSaveQuestion = async () => {
    const parsed = parseDraft(draft);
    if (!parsed.payload) {
      toast({
        title: 'Cannot save question',
        description: parsed.error,
        variant: 'destructive',
      });
      return;
    }

    setSavingQuestion(true);
    try {
      if (editingQuestionId) {
        await examsService.updateExamQuestion(assignmentId, editingQuestionId, parsed.payload);
      } else {
        await examsService.createExamQuestion(assignmentId, parsed.payload);
      }

      await loadQuestions();
      resetDraft();

      toast({
        title: editingQuestionId ? 'Question updated' : 'Question created',
        description: 'Exam question bank has been updated.',
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to save exam question';
      toast({
        title: 'Save failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setDeletingQuestionId(questionId);
    try {
      await examsService.deleteExamQuestion(assignmentId, questionId);
      await loadQuestions();
      if (editingQuestionId === questionId) {
        resetDraft();
      }
      toast({
        title: 'Question deleted',
        description: 'Exam question removed successfully.',
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to delete exam question';
      toast({
        title: 'Delete failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setDeletingQuestionId(null);
    }
  };

  return (
    <div className="space-y-5 mt-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Question Bank ({questions.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                void loadQuestions();
              }}
              disabled={loadingQuestions}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingQuestions ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingQuestions ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading questions...
            </div>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exam questions yet. Add your first question below.
            </p>
          ) : (
            questions.map((question) => (
              <Card key={question.id} className="border border-border/70 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-relaxed">{question.prompt}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg"
                        onClick={() => {
                          setEditingQuestionId(question.id);
                          setDraft(buildDraftFromQuestion(question));
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-destructive hover:text-destructive"
                        onClick={() => {
                          void handleDeleteQuestion(question.id);
                        }}
                        disabled={deletingQuestionId === question.id}
                      >
                        {deletingQuestionId === question.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="rounded-lg text-xs">
                      {question.points} pts
                    </Badge>
                    <Badge variant="outline" className="rounded-lg text-xs">
                      Order {question.order_index}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    {question.choices.map((choice, index) => (
                      <p key={`${question.id}-${index}`} className="text-xs text-muted-foreground">
                        {index === question.correct_choice_index ? 'Correct' : 'Choice'} {index}: {choice}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {editingQuestionId ? 'Edit Question' : 'Add Question'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold">Prompt</label>
            <Textarea
              value={draft.prompt}
              onChange={(event) => setDraft((prev) => ({ ...prev, prompt: event.target.value }))}
              placeholder="Write the exam question prompt..."
              className="mt-1 rounded-lg min-h-20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold">Choices (one per line)</label>
            <Textarea
              value={draft.choicesText}
              onChange={(event) => setDraft((prev) => ({ ...prev, choicesText: event.target.value }))}
              placeholder={`Choice A\nChoice B\nChoice C\nChoice D`}
              className="mt-1 rounded-lg min-h-24"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold">Correct Choice Index</label>
              <Input
                type="number"
                min="0"
                value={draft.correctChoiceIndex}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, correctChoiceIndex: event.target.value }))
                }
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Points</label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={draft.points}
                onChange={(event) => setDraft((prev) => ({ ...prev, points: event.target.value }))}
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Order Index</label>
              <Input
                type="number"
                min="0"
                value={draft.orderIndex}
                onChange={(event) => setDraft((prev) => ({ ...prev, orderIndex: event.target.value }))}
                className="mt-1 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold">Explanation (optional)</label>
            <Textarea
              value={draft.explanation}
              onChange={(event) => setDraft((prev) => ({ ...prev, explanation: event.target.value }))}
              placeholder="Optional explanation shown after grading."
              className="mt-1 rounded-lg min-h-16"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {editingQuestionId && (
              <Button
                variant="outline"
                className="rounded-lg"
                onClick={resetDraft}
                disabled={savingQuestion}
              >
                Cancel Edit
              </Button>
            )}
            <Button
              className="rounded-lg"
              onClick={() => {
                void handleSaveQuestion();
              }}
              disabled={savingQuestion}
            >
              {savingQuestion ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {editingQuestionId ? 'Update Question' : 'Create Question'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Proctoring Violations ({violations.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                void loadViolations();
              }}
              disabled={loadingViolations}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingViolations ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingViolations ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading violations...
            </div>
          ) : violations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No violations reported yet for this exam.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {groupedViolations.map(([type, count]) => (
                  <Badge key={type} variant="outline" className="rounded-lg text-xs">
                    {formatViolationType(type)}: {count}
                  </Badge>
                ))}
              </div>

              <div className="space-y-2">
                {violations.map((violation) => (
                  <Card key={violation.id} className="border border-border/70 shadow-none">
                    <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          {formatViolationType(violation.violation_type)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Attempt {violation.attempt_id.slice(0, 8)}... • Student {violation.student_id.slice(0, 8)}...
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(violation.created_at).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
