import { useRef } from 'react';
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
import { cn } from '@/lib/utils';
import type { QuizBuilderQuestion, ImportedQuestionDraft, QuizQuestionType } from './lib/quiz-import';
import {
  QUIZ_QUESTION_TYPE_OPTIONS,
  QUESTION_IMPORT_RECOMMENDED_FILE_TYPE,
  QUESTION_IMPORT_ACCEPT,
  QUESTION_IMPORT_DOCX_GUIDE,
} from './lib/quiz-import';

interface ExamFormProps {
  examQuestions: QuizBuilderQuestion[];
  examImportedQuestions: ImportedQuestionDraft[];
  examImportFileName: string | null;
  examQuestionOrder: 'sequence' | 'random';
  setExamQuestionOrder: (v: 'sequence' | 'random') => void;
  examQuestionSelection: 'sequence' | 'random';
  setExamQuestionSelection: (v: 'sequence' | 'random') => void;
  examIntegrityProfile: 'standard' | 'strict';
  setExamIntegrityProfile: (v: 'standard' | 'strict') => void;
  examTimerEnabled: boolean;
  setExamTimerEnabled: (v: boolean) => void;
  examDurationMinutes: string;
  setExamDurationMinutes: (v: string) => void;
  examRequireAgreementBeforeStart: boolean;
  setExamRequireAgreementBeforeStart: (v: boolean) => void;
  examAutoSubmitOnFullscreenExit: boolean;
  setExamAutoSubmitOnFullscreenExit: (v: boolean) => void;
  examAutoSubmitOnTabSwitch: boolean;
  setExamAutoSubmitOnTabSwitch: (v: boolean) => void;
  examOneQuestionAtATime: boolean;
  setExamOneQuestionAtATime: (v: boolean) => void;
  examMaxViolations: string;
  setExamMaxViolations: (v: string) => void;
  addExamQuestion: () => void;
  removeExamQuestion: (id: string) => void;
  updateExamQuestion: (id: string, update: Partial<QuizBuilderQuestion>) => void;
  updateExamChoice: (id: string, choiceIndex: number, value: string) => void;
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadTemplate: () => void | Promise<void>;
  onImageUpload?: (questionId: string, file: File) => Promise<void>;
  clearFieldError: (field: string) => void;
  examBuilderCandidateCount: number;
  examBuilderReadyCount: number;
  examChapterPoolEnabled: boolean;
  setExamChapterPoolEnabled: (v: boolean) => void;
  examChapterPool: Array<{ tag: string; count: number }>;
  setExamChapterPool: (v: Array<{ tag: string; count: number }>) => void;
}

export function ExamForm({
  examQuestions,
  examImportedQuestions,
  examImportFileName,
  examQuestionOrder,
  setExamQuestionOrder,
  examQuestionSelection,
  setExamQuestionSelection,
  examIntegrityProfile,
  setExamIntegrityProfile,
  examTimerEnabled,
  setExamTimerEnabled,
  examDurationMinutes,
  setExamDurationMinutes,
  examRequireAgreementBeforeStart,
  setExamRequireAgreementBeforeStart,
  examAutoSubmitOnFullscreenExit,
  setExamAutoSubmitOnFullscreenExit,
  examAutoSubmitOnTabSwitch,
  setExamAutoSubmitOnTabSwitch,
  examOneQuestionAtATime,
  setExamOneQuestionAtATime,
  examMaxViolations,
  setExamMaxViolations,
  addExamQuestion,
  removeExamQuestion,
  updateExamQuestion,
  updateExamChoice,
  onImportFile,
  onDownloadTemplate,
  onImageUpload,
  clearFieldError,
  examBuilderCandidateCount,
  examBuilderReadyCount,
  examChapterPoolEnabled,
  setExamChapterPoolEnabled,
  examChapterPool,
  setExamChapterPool,
}: ExamFormProps) {
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const detectedChapters = Array.from(
    new Set(examQuestions.map((q) => q.chapterTag?.trim()).filter((t): t is string => Boolean(t)))
  );

  const handleChapterPoolCountChange = (tag: string, count: number) => {
    setExamChapterPool(
      examChapterPool.map((entry) =>
        entry.tag === tag ? { ...entry, count: Math.max(1, count) } : entry
      )
    );
  };

  const syncChapterPool = (chapters: string[]) => {
    const existing = new Map(examChapterPool.map((e) => [e.tag, e.count]));
    const next = chapters.map((tag) => ({ tag, count: existing.get(tag) ?? 1 }));
    setExamChapterPool(next);
  };

  const handleImageFileSelect = async (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;
    e.target.value = '';
    await onImageUpload(questionId, file);
  };

  return (
    <Card className="border border-amber-200 bg-amber-50/60">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-semibold">Question Order Mode</label>
            <Select value={examQuestionOrder} onValueChange={(value) => setExamQuestionOrder(value as 'sequence' | 'random')}>
              <SelectTrigger className="mt-2 rounded-lg">
                <SelectValue placeholder="Select order mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequence">Sequential</SelectItem>
                <SelectItem value="random">Randomized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold">Question Selection</label>
            <Select value={examQuestionSelection} onValueChange={(value) => setExamQuestionSelection(value as 'sequence' | 'random')}>
              <SelectTrigger className="mt-2 rounded-lg">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Randomized</SelectItem>
                <SelectItem value="sequence">Sequential</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-semibold">Integrity Profile</label>
            <Select value={examIntegrityProfile} onValueChange={(value) => setExamIntegrityProfile(value as 'standard' | 'strict')}>
              <SelectTrigger className="mt-2 rounded-lg">
                <SelectValue placeholder="Select integrity profile" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-semibold">Time limit</Label>
            <Switch checked={examTimerEnabled} onCheckedChange={setExamTimerEnabled} />
          </div>
          {examTimerEnabled && (
            <div className="flex items-center gap-2 ml-2">
              <Input type="number" min={1} max={300} value={examDurationMinutes}
                onChange={(e) => setExamDurationMinutes(e.target.value)} className="w-24" />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold">Exam Integrity Policies</p>
            <p className="text-xs text-muted-foreground mt-1">
              Configure required agreement and hard-trigger auto-submit behavior for proctored attempts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Require Pre-Exam Agreement</p>
                <p className="text-xs text-muted-foreground">Students must acknowledge rules before begin.</p>
              </div>
              <Switch checked={examRequireAgreementBeforeStart} onCheckedChange={setExamRequireAgreementBeforeStart} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Auto-Submit on Fullscreen Exit</p>
                <p className="text-xs text-muted-foreground">Finalize attempt immediately on fullscreen break.</p>
              </div>
              <Switch checked={examAutoSubmitOnFullscreenExit} onCheckedChange={setExamAutoSubmitOnFullscreenExit} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 md:col-span-2">
              <div>
                <p className="text-sm font-medium">Auto-Submit on Tab Switch</p>
                <p className="text-xs text-muted-foreground">Finalize attempt when focus leaves the exam tab.</p>
              </div>
              <Switch checked={examAutoSubmitOnTabSwitch} onCheckedChange={setExamAutoSubmitOnTabSwitch} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 md:col-span-2">
              <div>
                <p className="text-sm font-medium">Show One Question at a Time</p>
                <p className="text-xs text-muted-foreground">Students see questions one by one, navigating with Previous / Next.</p>
              </div>
              <Switch checked={examOneQuestionAtATime} onCheckedChange={setExamOneQuestionAtATime} />
            </div>

            <div>
              <label className="text-sm font-semibold">Max Violations Before Terminate</label>
              <Input
                type="number" min="1" max="20" value={examMaxViolations}
                onChange={(event) => setExamMaxViolations(event.target.value)}
                className="mt-2 rounded-lg"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Attempt is auto-terminated when total violations reach this count.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 bg-background/60 p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Import Test Questions</p>
              <p className="text-xs text-muted-foreground">
                Recommended file type: {QUESTION_IMPORT_RECOMMENDED_FILE_TYPE}. Questions are auto-saved after exam creation.
              </p>
              <p className="text-xs text-muted-foreground mt-1">{QUESTION_IMPORT_DOCX_GUIDE}</p>
            </div>
            <div className="flex gap-2">
              <input
                id="exam-question-import-input"
                type="file"
                accept={QUESTION_IMPORT_ACCEPT}
                className="hidden"
                onChange={onImportFile}
              />
              <Button type="button" variant="outline" className="rounded-lg" onClick={() => void onDownloadTemplate()}>
                Download DOCX Template
              </Button>
              <Button type="button" className="rounded-lg" asChild>
                <label htmlFor="exam-question-import-input" className="cursor-pointer">Import File</label>
              </Button>
            </div>
          </div>

          {examImportFileName && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Imported source: {examImportFileName}</p>
              <p>{examImportedQuestions.length} question{examImportedQuestions.length === 1 ? '' : 's'} loaded into the builder below. Review and edit before saving.</p>
              <p>Supported types: Multiple Choice, True/False, Short Answer, Fill in the Blank, and Essay.</p>
            </div>
          )}
        </div>

        {detectedChapters.length > 0 && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Chapter Question Pool</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Randomly select a specific number of questions from each chapter when the exam starts.
                </p>
              </div>
              <Switch
                checked={examChapterPoolEnabled}
                onCheckedChange={(v) => {
                  setExamChapterPoolEnabled(v);
                  if (v) syncChapterPool(detectedChapters);
                }}
              />
            </div>

            {examChapterPoolEnabled && (
              <div className="space-y-2">
                {detectedChapters.map((chapter) => {
                  const entry = examChapterPool.find((e) => e.tag === chapter);
                  const available = examQuestions.filter((q) => q.chapterTag?.trim() === chapter).length;
                  return (
                    <div key={chapter} className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{chapter}</p>
                        <p className="text-xs text-muted-foreground">{available} question{available === 1 ? '' : 's'} available</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">Select</span>
                        <Input
                          type="number"
                          min={1}
                          max={available}
                          value={entry?.count ?? 1}
                          onChange={(e) => handleChapterPoolCountChange(chapter, parseInt(e.target.value, 10) || 1)}
                          className="w-16 rounded-lg h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">/ {available}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-violet-200/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Exam Question Builder</p>
            <Badge variant="secondary" className="rounded-full text-xs">
              {examQuestions.length} question{examQuestions.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Build exam questions directly in this form. Tag questions with a chapter to enable chapter-based pooling above.
          </p>

          <div className="space-y-3">
            {examQuestions.map((question, index) => (
              <Card key={question.id} className="border border-border/70 bg-card animate-in fade-in-0 slide-in-from-top-1 duration-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Question {index + 1}</p>
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-8 px-2 text-destructive"
                      disabled={examQuestions.length <= 1}
                      onClick={() => removeExamQuestion(question.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Question Type</label>
                      <Select
                        value={question.type}
                        onValueChange={(value) => updateExamQuestion(question.id, { type: value as QuizQuestionType })}
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
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={question.points ?? 1}
                        onChange={(e) => updateExamQuestion(question.id, { points: parseFloat(e.target.value) || 1 })}
                        className="mt-2 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Chapter Tag</label>
                    <Input
                      value={question.chapterTag ?? ''}
                      onChange={(e) => updateExamQuestion(question.id, { chapterTag: e.target.value || null })}
                      placeholder="e.g., Chapter 1, Algebra, Unit 3..."
                      className="mt-2 rounded-lg"
                      list={`chapter-suggestions-${question.id}`}
                    />
                    <datalist id={`chapter-suggestions-${question.id}`}>
                      {detectedChapters.map((ch) => (
                        <option key={ch} value={ch} />
                      ))}
                    </datalist>
                    <p className="text-[11px] text-muted-foreground mt-1">Optional. Used for chapter pooling above.</p>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Question Image</label>
                    {question.imageUrl ? (
                      <div className="mt-2 relative">
                        <img
                          src={question.imageUrl}
                          alt="Question image"
                          className="max-h-48 rounded-lg border border-border object-contain bg-muted/30"
                        />
                        <button
                          type="button"
                          onClick={() => updateExamQuestion(question.id, { imageUrl: null })}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ) : onImageUpload ? (
                      <div className="mt-2">
                        <input
                          ref={(el) => { imageInputRefs.current[question.id] = el; }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          id={`exam-q-img-${question.id}`}
                          onChange={(e) => void handleImageFileSelect(question.id, e)}
                        />
                        <label
                          htmlFor={`exam-q-img-${question.id}`}
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
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground italic">Save the exam first to attach question images.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium">Prompt</label>
                    <Textarea
                      value={question.prompt}
                      onChange={(event) => updateExamQuestion(question.id, { prompt: event.target.value })}
                      placeholder="Type your exam question prompt"
                      className="mt-2 min-h-20 rounded-lg resize-none"
                    />
                  </div>

                  {question.type === 'multiple_choice' && (
                    <div className="space-y-2 animate-in fade-in-0 zoom-in-95 duration-200">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Choices</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {question.choices.map((choice, choiceIndex) => (
                            <Input
                              key={`${question.id}-exam-${choiceIndex}`}
                              value={choice}
                              onChange={(event) => updateExamChoice(question.id, choiceIndex, event.target.value)}
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
                          onValueChange={(value) => updateExamQuestion(question.id, { answerKey: value })}
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
                    <div className="animate-in fade-in-0 zoom-in-95 duration-200">
                      <label className="text-sm font-medium">Correct Answer</label>
                      <Select
                        value={question.answerKey || 'True'}
                        onValueChange={(value) => updateExamQuestion(question.id, { answerKey: value })}
                      >
                        <SelectTrigger className="mt-2 rounded-lg">
                          <SelectValue placeholder="Select answer" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="True">True</SelectItem>
                          <SelectItem value="False">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {question.type !== 'multiple_choice' && question.type !== 'true_false' && (
                    <div className="animate-in fade-in-0 zoom-in-95 duration-200">
                      <label className="text-sm font-medium">Answer Key</label>
                      <Input
                        value={question.answerKey}
                        onChange={(event) => updateExamQuestion(question.id, { answerKey: event.target.value })}
                        placeholder="Expected answer (use | for multiple accepted answers)"
                        className="mt-2 rounded-lg"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium">Explanation (optional)</label>
                    <Input
                      value={question.explanation ?? ''}
                      onChange={(e) => updateExamQuestion(question.id, { explanation: e.target.value || undefined })}
                      placeholder="Shown after submission to explain the correct answer"
                      className="mt-2 rounded-lg"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="button" variant="outline" className="w-full rounded-lg" onClick={addExamQuestion}>
            <Plus className="h-4 w-4 mr-2" />
            Add Exam Question
          </Button>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Builder readiness: {examBuilderReadyCount} of {examBuilderCandidateCount} drafted questions are ready for save.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full text-xs">
            Supports: MCQ · True/False · Short Answer · Fill in the Blank · Essay · Import from DOCX/JSON
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs">
            Proctored · Anti-cheat · Fullscreen enforced
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
