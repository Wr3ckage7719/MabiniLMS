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
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
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
  onDownloadTemplate: () => void;
  clearFieldError: (field: string) => void;
  examBuilderCandidateCount: number;
  examBuilderReadyCount: number;
  examImportReadyCount: number;
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
  clearFieldError,
  examBuilderCandidateCount,
  examBuilderReadyCount,
  examImportReadyCount,
}: ExamFormProps) {
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
              <Button type="button" variant="outline" className="rounded-lg" onClick={onDownloadTemplate}>
                Download JSON Template
              </Button>
              <Button type="button" className="rounded-lg" asChild>
                <label htmlFor="exam-question-import-input" className="cursor-pointer">Import File</label>
              </Button>
            </div>
          </div>

          {examImportFileName && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Imported source: {examImportFileName}</p>
              <p>{examImportReadyCount} of {examImportedQuestions.length} questions are ready for automatic save.</p>
              <p>
                For exam auto-save, objective backend item types are Multiple Choice, True/False, and Short Answer.
                Fill in the Blank and Essay are mapped to Short Answer when answer keys are provided.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-violet-200/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Exam Question Builder</p>
            <Badge variant="secondary" className="rounded-full text-xs">
              {examQuestions.length} question{examQuestions.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Build exam questions directly in this form. Fill in the Blank and Essay entries are saved as Short Answer
            when answer keys are provided.
          </p>

          <div className="space-y-3">
            {examQuestions.map((question, index) => (
              <Card key={question.id} className="border border-border/70 bg-card">
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
                    <label className="text-sm font-medium">Prompt</label>
                    <Textarea
                      value={question.prompt}
                      onChange={(event) => updateExamQuestion(question.id, { prompt: event.target.value })}
                      placeholder="Type your exam question prompt"
                      className="mt-2 min-h-20 rounded-lg resize-none"
                    />
                  </div>

                  {question.type === 'multiple_choice' && (
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
                      <div>
                        <label className="text-sm font-medium">Correct Answer Key</label>
                        <Input
                          value={question.answerKey}
                          onChange={(event) => updateExamQuestion(question.id, { answerKey: event.target.value })}
                          placeholder="Use choice text or letter (A-D)"
                          className="mt-2 rounded-lg"
                        />
                      </div>
                    </div>
                  )}

                  {question.type === 'true_false' && (
                    <div>
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
                    <div>
                      <label className="text-sm font-medium">Answer Key</label>
                      <Input
                        value={question.answerKey}
                        onChange={(event) => updateExamQuestion(question.id, { answerKey: event.target.value })}
                        placeholder="Expected answer (use | for multiple accepted answers)"
                        className="mt-2 rounded-lg"
                      />
                    </div>
                  )}
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
            <p>
              Supported live attempt item types are currently Multiple Choice and True/False. Short Answer-based items
              (including Fill in the Blank and Essay mappings) may not be playable in the current student exam player.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full text-xs">
            Supports: MCQ · True/False · Short Answer · Import from DOCX/JSON
          </Badge>
          <Badge variant="outline" className="rounded-full text-xs">
            Proctored · Anti-cheat · Fullscreen enforced
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
