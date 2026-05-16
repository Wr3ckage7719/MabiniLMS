import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Plus, Trash2, Image, X as XIcon } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import type {
  QuizBuilderQuestion,
  QuizQuestionType,
} from './lib/quiz-import';
import {
  QUIZ_QUESTION_TYPE_OPTIONS,
  QUESTION_IMPORT_RECOMMENDED_FILE_TYPE,
  QUESTION_IMPORT_ACCEPT,
  QUESTION_IMPORT_DOCX_GUIDE,
} from './lib/quiz-import';

interface QuizFormProps {
  quizQuestions: QuizBuilderQuestion[];
  quizQuestionOrder: 'sequence' | 'random';
  setQuizQuestionOrder: (v: 'sequence' | 'random') => void;
  quizOneQuestionAtATime: boolean;
  setQuizOneQuestionAtATime: (v: boolean) => void;
  quizTimerEnabled: boolean;
  setQuizTimerEnabled: (v: boolean) => void;
  quizDurationMinutes: string;
  setQuizDurationMinutes: (v: string) => void;
  quizExamRestrictionsEnabled: boolean;
  setQuizExamRestrictionsEnabled: (v: boolean) => void;
  quizRequireFullscreen: boolean;
  setQuizRequireFullscreen: (v: boolean) => void;
  quizAutoSubmitOnTabSwitch: boolean;
  setQuizAutoSubmitOnTabSwitch: (v: boolean) => void;
  quizMaxViolations: string;
  setQuizMaxViolations: (v: string) => void;
  quizImportFileName: string | null;
  addQuizQuestion: () => void;
  removeQuizQuestion: (id: string) => void;
  updateQuizQuestion: (id: string, update: Partial<QuizBuilderQuestion>) => void;
  updateQuizChoice: (id: string, choiceIndex: number, value: string) => void;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void | Promise<void>;
  onImageUpload?: (questionId: string, file: File) => Promise<void>;
  quizQuestionsError?: string;
  clearFieldError: (field: string) => void;
}

export function QuizForm({
  quizQuestions,
  quizQuestionOrder,
  setQuizQuestionOrder,
  quizOneQuestionAtATime,
  setQuizOneQuestionAtATime,
  quizTimerEnabled,
  setQuizTimerEnabled,
  quizDurationMinutes,
  setQuizDurationMinutes,
  quizExamRestrictionsEnabled,
  setQuizExamRestrictionsEnabled,
  quizRequireFullscreen,
  setQuizRequireFullscreen,
  quizAutoSubmitOnTabSwitch,
  setQuizAutoSubmitOnTabSwitch,
  quizMaxViolations,
  setQuizMaxViolations,
  quizImportFileName,
  addQuizQuestion,
  removeQuizQuestion,
  updateQuizQuestion,
  updateQuizChoice,
  onImportFile,
  onDownloadTemplate,
  onImageUpload,
  quizQuestionsError,
  clearFieldError,
}: QuizFormProps) {
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleImageFileSelect = async (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    e.target.value = '';
    await onImageUpload(questionId, file);
  };

  return (
    <Card className="border border-violet-200 bg-violet-50/60">
      <CardContent className="p-4 space-y-4">
        <div>
          <label className="text-sm font-semibold">Question Order Mode</label>
          <Select value={quizQuestionOrder} onValueChange={(value) => setQuizQuestionOrder(value as 'sequence' | 'random')}>
            <SelectTrigger className="mt-2 rounded-lg">
              <SelectValue placeholder="Select order mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequence">Sequential</SelectItem>
              <SelectItem value="random">Randomized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-violet-200/70 bg-background p-3">
          <div>
            <p className="text-sm font-medium">Show One Question at a Time</p>
            <p className="text-xs text-muted-foreground">Students see questions one by one, navigating with Previous / Next.</p>
          </div>
          <Switch checked={quizOneQuestionAtATime} onCheckedChange={setQuizOneQuestionAtATime} />
        </div>

        <Card className="border">
          <CardContent className="p-4 space-y-3">
            <h4 className="text-sm font-semibold">Quiz Settings</h4>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Time limit</Label>
                <p className="text-xs text-muted-foreground">Auto-submit when time expires.</p>
              </div>
              <Switch checked={quizTimerEnabled} onCheckedChange={setQuizTimerEnabled} />
            </div>
            {quizTimerEnabled && (
              <div className="flex items-center gap-2 ml-2">
                <Input type="number" min={1} max={240} value={quizDurationMinutes}
                  onChange={(e) => setQuizDurationMinutes(e.target.value)} className="w-24" />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <div>
                <Label className="text-sm">Exam-like restrictions</Label>
                <p className="text-xs text-muted-foreground">Enable fullscreen lock and tab-switch detection.</p>
              </div>
              <Switch checked={quizExamRestrictionsEnabled} onCheckedChange={setQuizExamRestrictionsEnabled} />
            </div>
            {quizExamRestrictionsEnabled && (
              <div className="ml-2 space-y-2">
                <label className="flex items-center justify-between text-sm">
                  <span>Require fullscreen</span>
                  <Switch checked={quizRequireFullscreen} onCheckedChange={setQuizRequireFullscreen} />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span>Auto-submit on tab switch</span>
                  <Switch checked={quizAutoSubmitOnTabSwitch} onCheckedChange={setQuizAutoSubmitOnTabSwitch} />
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Max violations</span>
                  <Input type="number" min={1} max={10} value={quizMaxViolations}
                    onChange={(e) => setQuizMaxViolations(e.target.value)} className="w-20" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="rounded-lg border border-violet-200/70 bg-background p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Import Questions</p>
              <p className="text-xs text-muted-foreground">
                Recommended file type: {QUESTION_IMPORT_RECOMMENDED_FILE_TYPE}. Importing replaces the current quiz draft questions.
              </p>
              <p className="text-xs text-muted-foreground mt-1">{QUESTION_IMPORT_DOCX_GUIDE}</p>
            </div>
            <div className="flex gap-2">
              <input
                id="quiz-question-import-input"
                type="file"
                accept={QUESTION_IMPORT_ACCEPT}
                className="hidden"
                onChange={onImportFile}
              />
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => void onDownloadTemplate()}>
                Download DOCX Template
              </Button>
              <Button type="button" className="rounded-lg" asChild>
                <label htmlFor="quiz-question-import-input" className="cursor-pointer">Import File</label>
              </Button>
            </div>
          </div>
          {quizImportFileName && (
            <p className="text-xs text-muted-foreground">Imported source: {quizImportFileName}</p>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-violet-200/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Question Builder</p>
            <Badge variant="secondary" className="rounded-full text-xs">
              {quizQuestions.length} question{quizQuestions.length === 1 ? '' : 's'}
            </Badge>
          </div>

          {quizQuestionsError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {quizQuestionsError}
            </p>
          )}

          <div className="space-y-3">
            {quizQuestions.map((question, index) => (
              <Card key={question.id} className="border border-border/70 bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Question {index + 1}</p>
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-8 px-2 text-destructive"
                      disabled={quizQuestions.length <= 1}
                      onClick={() => removeQuizQuestion(question.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-sm font-medium">Question Type</label>
                      <Select
                        value={question.type}
                        onValueChange={(value) => updateQuizQuestion(question.id, { type: value as QuizQuestionType })}
                      >
                        <SelectTrigger className="mt-2 rounded-lg">
                          <SelectValue placeholder="Select question type" />
                        </SelectTrigger>
                        <SelectContent>
                          {QUIZ_QUESTION_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Points</label>
                      <Input
                        type="number" min="0.5" step="0.5"
                        value={question.points ?? 1}
                        onChange={(e) => updateQuizQuestion(question.id, { points: Number(e.target.value) || 1 })}
                        className="mt-2 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Prompt</label>
                    <Textarea
                      value={question.prompt}
                      onChange={(event) => { updateQuizQuestion(question.id, { prompt: event.target.value }); clearFieldError('quizQuestions'); }}
                      placeholder={question.type === 'fill_in_blank' ? 'e.g., The capital of the Philippines is ___.': 'Type your question prompt'}
                      className="mt-2 min-h-20 rounded-lg resize-none"
                    />
                    {question.type === 'fill_in_blank' && (
                      <p className="text-xs text-muted-foreground mt-1">Use ___ (three underscores) to mark the blank in your prompt.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium">Question Image</label>
                    {question.imageUrl ? (
                      <div className="mt-2 relative">
                        <img
                          src={question.imageUrl}
                          alt="Question image"
                          className="max-h-40 rounded-lg border border-border object-contain bg-muted/30"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuizQuestion(question.id, { imageUrl: null })}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <input
                          ref={(el) => { imageInputRefs.current[question.id] = el; }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          id={`quiz-q-img-${question.id}`}
                          onChange={(e) => void handleImageFileSelect(question.id, e)}
                        />
                        <label
                          htmlFor={`quiz-q-img-${question.id}`}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border',
                            'text-sm text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors w-fit'
                          )}
                        >
                          <Image className="h-4 w-4" />
                          Attach image (optional)
                        </label>
                        <p className="text-[11px] text-muted-foreground mt-1">JPEG, PNG, WebP · max 5 MB</p>
                      </div>
                    )}
                  </div>

                  {question.type === 'multiple_choice' && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Choices</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {question.choices.map((choice, choiceIndex) => (
                            <Input
                              key={`${question.id}-${choiceIndex}`}
                              value={choice}
                              onChange={(event) => updateQuizChoice(question.id, choiceIndex, event.target.value)}
                              placeholder={`Choice ${String.fromCharCode(65 + choiceIndex)}`}
                              className="rounded-lg"
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Correct Answer</label>
                        <Select
                          value={question.answerKey || 'A'}
                          onValueChange={(value) => updateQuizQuestion(question.id, { answerKey: value })}
                        >
                          <SelectTrigger className="mt-2 rounded-lg">
                            <SelectValue placeholder="Select correct answer" />
                          </SelectTrigger>
                          <SelectContent>
                            {question.choices.map((choice, choiceIndex) => (
                              <SelectItem key={choiceIndex} value={String.fromCharCode(65 + choiceIndex)}>
                                {String.fromCharCode(65 + choiceIndex)}{choice.trim() ? `. ${choice.trim()}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {question.type === 'true_false' && (
                    <div>
                      <label className="text-sm font-medium">Correct Answer</label>
                      <Select
                        value={question.answerKey || 'true'}
                        onValueChange={(value) => updateQuizQuestion(question.id, { answerKey: value })}
                      >
                        <SelectTrigger className="mt-2 rounded-lg">
                          <SelectValue placeholder="Select correct answer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {question.type !== 'multiple_choice' && question.type !== 'true_false' && (
                    <div>
                      <label className="text-sm font-medium">Accepted Answer(s)</label>
                      <Input
                        value={question.answerKey}
                        onChange={(event) => updateQuizQuestion(question.id, { answerKey: event.target.value })}
                        placeholder="Use | to separate multiple accepted answers"
                        className="mt-2 rounded-lg"
                      />
                      <p className="text-xs text-muted-foreground mt-1">e.g. photosynthesis | Photosynthesis</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="button" variant="outline" className="w-full rounded-lg" onClick={addQuizQuestion}>
            <Plus className="h-4 w-4 mr-2" />
            Add Quiz Question
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            Supports: MCQ · True/False · Short Answer · Fill in the Blank · Essay
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs bg-background">
            Auto-graded · No proctoring required
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
