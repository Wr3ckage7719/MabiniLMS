import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, Loader2, ShieldAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { examsService, ExamAttemptSession, ExamSubmissionResult, ProctorViolationType } from '@/services/exams.service'

interface ProctoredExamDialogProps {
  assignmentId: string
  assignmentTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const throttleWindowMs = 1400

const formatTimer = (remainingSeconds: number): string => {
  const safeSeconds = Math.max(0, remainingSeconds)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function ProctoredExamDialog({
  assignmentId,
  assignmentTitle,
  open,
  onOpenChange,
}: ProctoredExamDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [session, setSession] = useState<ExamAttemptSession | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [answerMap, setAnswerMap] = useState<Record<string, number>>({})
  const [textAnswerMap, setTextAnswerMap] = useState<Record<string, string>>({})
  const [savingAnswerQuestionId, setSavingAnswerQuestionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ExamSubmissionResult | null>(null)
  const [violationCount, setViolationCount] = useState(0)
  const [terminated, setTerminated] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [agreementChecked, setAgreementChecked] = useState(false)

  const isAttemptActive = session?.attempt.status === 'active' && !result && !terminated
  const lastViolationAtRef = useRef<Record<string, number>>({})
  const timeoutSubmitInFlightRef = useRef(false)

  const resetDialogState = useCallback(() => {
    setSession(null)
    setLoadingSession(false)
    setSessionError(null)
    setStarted(false)
    setAnswerMap({})
    setTextAnswerMap({})
    setSavingAnswerQuestionId(null)
    setSubmitting(false)
    setResult(null)
    setViolationCount(0)
    setTerminated(false)
    setSecondsLeft(null)
    setAgreementChecked(false)
    lastViolationAtRef.current = {}
    timeoutSubmitInFlightRef.current = false
  }, [])

  const loadSession = useCallback(async () => {
    setLoadingSession(true)
    setSessionError(null)

    try {
      const loaded = await examsService.startExamAttempt(assignmentId, {
        resume_active_attempt: true,
      })

      setSession(loaded)
      setViolationCount(0)
      setTerminated(loaded.attempt.status === 'terminated')

      if (loaded.attempt.status !== 'active') {
        setStarted(false)
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error?.message
        || error?.response?.data?.message
        || error?.message
        || 'Failed to load exam session'

      setSessionError(message)
    } finally {
      setLoadingSession(false)
    }
  }, [assignmentId])

  useEffect(() => {
    if (!open) {
      resetDialogState()
      return
    }

    void loadSession()
  }, [loadSession, open, resetDialogState])

  const enterFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      return
    }

    try {
      await document.documentElement.requestFullscreen()
    } catch {
      toast({
        title: 'Fullscreen required',
        description: 'Your browser blocked fullscreen mode. Continue only if your teacher permits.',
        variant: 'destructive',
      })
    }
  }, [toast])

  const reportViolation = useCallback(
    async (type: ProctorViolationType, metadata?: Record<string, unknown>) => {
      if (!session || !started || !isAttemptActive) {
        return
      }

      const now = Date.now()
      const lastEventAt = lastViolationAtRef.current[type] || 0

      if (now - lastEventAt < throttleWindowMs) {
        return
      }

      lastViolationAtRef.current[type] = now

      try {
        const response = await examsService.reportExamViolation(session.attempt.id, {
          violation_type: type,
          metadata,
        })

        setViolationCount(response.violation_count)

        if (response.auto_submitted && response.submission_result) {
          setResult(response.submission_result)
          setStarted(false)
          setTerminated(false)
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {
              // Ignore fullscreen exit failures
            })
          }
          toast({
            title: 'Attempt auto-submitted',
            description: 'Hard policy trigger finalized your attempt automatically.',
            variant: 'destructive',
          })
          return
        }

        if (response.terminated) {
          setTerminated(true)
          setStarted(false)
          toast({
            title: 'Attempt terminated',
            description: 'Violation threshold reached. You can still submit your current answers.',
            variant: 'destructive',
          })
        }
      } catch (error) {
        console.error('Failed to report exam violation', error)
      }
    },
    [isAttemptActive, session, started, toast]
  )

  const handleBeginExam = useCallback(async () => {
    if (!session) {
      return
    }

    const agreementRequired = Boolean(session.policy.require_agreement_before_start)
    if (agreementRequired && !agreementChecked) {
      toast({
        title: 'Agreement required',
        description: 'Please confirm the pre-exam agreement before starting.',
        variant: 'destructive',
      })
      return
    }

    if (session.assignment.is_proctored) {
      await enterFullscreen()
    }

    setStarted(true)
  }, [agreementChecked, enterFullscreen, session, toast])

  const handleSelectAnswer = useCallback(
    async (questionId: string, selectedChoiceIndex: number) => {
      if (!session || !isAttemptActive || submitting) {
        return
      }

      setAnswerMap((prev) => ({
        ...prev,
        [questionId]: selectedChoiceIndex,
      }))
      setSavingAnswerQuestionId(questionId)

      try {
        await examsService.submitExamAnswer(session.attempt.id, {
          question_id: questionId,
          selected_choice_index: selectedChoiceIndex,
        })
      } catch (error: any) {
        toast({
          title: 'Answer not saved',
          description:
            error?.response?.data?.error?.message
            || error?.response?.data?.message
            || error?.message
            || 'Please try selecting the answer again.',
          variant: 'destructive',
        })
      } finally {
        setSavingAnswerQuestionId((current) => (current === questionId ? null : current))
      }
    },
    [isAttemptActive, session, submitting, toast]
  )

  const handleTextAnswer = useCallback(
    async (questionId: string, text: string) => {
      if (!session || !isAttemptActive || submitting || !text.trim()) {
        return
      }

      setSavingAnswerQuestionId(questionId)
      try {
        await examsService.submitExamAnswer(session.attempt.id, {
          question_id: questionId,
          answer_text: text.trim(),
        })
      } catch (error: any) {
        toast({
          title: 'Answer not saved',
          description:
            error?.response?.data?.error?.message ||
            error?.response?.data?.message ||
            error?.message ||
            'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setSavingAnswerQuestionId((current) => (current === questionId ? null : current))
      }
    },
    [isAttemptActive, session, submitting, toast]
  )

  const submitAttempt = useCallback(
    async (reason: 'manual' | 'timeout' = 'manual') => {
      if (!session || submitting || result) {
        return
      }

      setSubmitting(true)
      try {
        const submitted = await examsService.submitExamAttempt(session.attempt.id)
        setResult(submitted)
        setStarted(false)

        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {
            // Ignore fullscreen exit failures
          })
        }

        void queryClient.invalidateQueries({ queryKey: ['my-grades'] })
        void queryClient.invalidateQueries({ queryKey: ['weighted-course-grade'] })

        toast({
          title: reason === 'timeout' ? 'Time expired' : 'Exam submitted',
          description: `Score: ${submitted.score.toFixed(2)} / ${submitted.max_score.toFixed(2)} (${submitted.percentage.toFixed(2)}%)`,
        })
      } catch (error: any) {
        toast({
          title: 'Submission failed',
          description:
            error?.response?.data?.error?.message
            || error?.response?.data?.message
            || error?.message
            || 'Failed to submit exam attempt',
          variant: 'destructive',
        })
      } finally {
        setSubmitting(false)
        timeoutSubmitInFlightRef.current = false
      }
    },
    [queryClient, result, session, submitting, toast]
  )

  useEffect(() => {
    if (!session || !started || !isAttemptActive) {
      setSecondsLeft(null)
      return
    }

    if (!session.assignment.exam_duration_minutes || session.assignment.exam_duration_minutes <= 0) {
      setSecondsLeft(null)
      return
    }

    const startedAtMs = new Date(session.attempt.started_at).getTime()
    const deadlineMs = startedAtMs + session.assignment.exam_duration_minutes * 60 * 1000

    const updateRemainingTime = () => {
      const remainingSeconds = Math.ceil((deadlineMs - Date.now()) / 1000)
      setSecondsLeft(Math.max(0, remainingSeconds))

      if (remainingSeconds <= 0 && !timeoutSubmitInFlightRef.current) {
        timeoutSubmitInFlightRef.current = true
        void submitAttempt('timeout')
      }
    }

    updateRemainingTime()
    const timerId = window.setInterval(updateRemainingTime, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [isAttemptActive, session, started, submitAttempt])

  useEffect(() => {
    if (!session || !started || !isAttemptActive || !session.assignment.is_proctored) {
      return
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        void reportViolation('visibility_hidden', { source: 'visibilitychange' })
      }
    }

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        void reportViolation('fullscreen_exit', { source: 'fullscreenchange' })
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      if (session.policy.block_context_menu) {
        event.preventDefault()
        void reportViolation('context_menu', { source: 'contextmenu' })
      }
    }

    const onCopy = (event: ClipboardEvent) => {
      if (session.policy.block_clipboard) {
        event.preventDefault()
        void reportViolation('copy', { source: 'clipboard' })
      }
    }

    const onPaste = (event: ClipboardEvent) => {
      if (session.policy.block_clipboard) {
        event.preventDefault()
        void reportViolation('paste', { source: 'clipboard' })
      }
    }

    const onCut = (event: ClipboardEvent) => {
      if (session.policy.block_clipboard) {
        event.preventDefault()
        void reportViolation('cut', { source: 'clipboard' })
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12') {
        event.preventDefault()
        void reportViolation('devtools_open', { source: 'F12' })
      }
      const metaKey = event.ctrlKey || event.metaKey
      if (session.policy.block_print_shortcut && metaKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void reportViolation('print_shortcut', { source: 'keydown' })
      }
    }

    const devToolsThreshold = 160
    const onWindowResize = () => {
      if (
        window.outerWidth - window.innerWidth > devToolsThreshold ||
        window.outerHeight - window.innerHeight > devToolsThreshold
      ) {
        void reportViolation('devtools_open', { source: 'resize_heuristic' })
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    window.addEventListener('cut', onCut)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onWindowResize)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [isAttemptActive, reportViolation, session, started])

  const answeredCount = useMemo(() => {
    if (!session) return 0
    return session.questions.reduce((total, question) => {
      const hasChoice = answerMap[question.id] !== undefined
      const hasText = Boolean(textAnswerMap[question.id]?.trim())
      return hasChoice || hasText ? total + 1 : total
    }, 0)
  }, [answerMap, textAnswerMap, session])

  const progress = useMemo(() => {
    if (!session || session.questions.length === 0) return 0
    return (answeredCount / session.questions.length) * 100
  }, [answeredCount, session])

  const disableInteraction = !isAttemptActive || submitting || Boolean(result)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-dvw sm:max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            {session?.assignment.is_proctored ? 'Proctored Exam' : 'Quiz'}: {assignmentTitle}
          </DialogTitle>
          <DialogDescription>
            {session?.assignment.is_proctored
              ? 'This exam is proctored. Fullscreen, visibility, and restricted interaction events are monitored.'
              : 'Answer each question. Your responses are saved automatically as you go.'}
          </DialogDescription>
        </DialogHeader>

        {loadingSession && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loadingSession && sessionError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-destructive">{sessionError}</p>
              <Button variant="outline" onClick={() => void loadSession()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!loadingSession && !sessionError && session && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs rounded-md bg-secondary px-2 py-1">
                  Questions: {session.questions.length}
                </span>
                <span className="text-xs rounded-md bg-secondary px-2 py-1">
                  Max score: {session.assignment.max_points}
                </span>
                <span className="text-xs rounded-md bg-secondary px-2 py-1">
                  Violations: {violationCount}
                </span>
                {secondsLeft !== null && (
                  <span className="text-xs rounded-md bg-secondary px-2 py-1 inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimer(secondsLeft)}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Answered {answeredCount}/{session.questions.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </div>

            {session.assignment.is_proctored && started && (
              <Card className="border-yellow-500/40 bg-yellow-500/10">
                <CardContent className="p-3 text-xs text-yellow-100 flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 mt-0.5" />
                  <span>
                    Restrictions are active only during this attempt. Right-click, clipboard actions, print shortcut,
                    tab switch, and fullscreen exits are tracked.
                  </span>
                </CardContent>
              </Card>
            )}

            {terminated && (
              <Card className="border-destructive/40 bg-destructive/10">
                <CardContent className="p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <span>This attempt was terminated due to policy violations. Submit now to finalize your current answers.</span>
                </CardContent>
              </Card>
            )}

            {!started && !result && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    When you begin, keep the exam in focus and remain in fullscreen mode to avoid violation events.
                  </p>
                  {Boolean(session.policy.require_agreement_before_start) && (
                    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <Checkbox
                        id="proctored-exam-agreement"
                        checked={agreementChecked}
                        onCheckedChange={(checked) => setAgreementChecked(Boolean(checked))}
                      />
                      <label htmlFor="proctored-exam-agreement" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                        I agree to stay in this exam tab, keep fullscreen active, and follow proctoring rules.
                      </label>
                    </div>
                  )}
                  <Button
                    onClick={() => void handleBeginExam()}
                    disabled={
                      terminated
                      || (Boolean(session.policy.require_agreement_before_start) && !agreementChecked)
                    }
                  >
                    Begin Exam
                  </Button>
                </CardContent>
              </Card>
            )}

            {started && !result && (
              <div className="space-y-3">
                {session.questions.map((question, questionIndex) => {
                  const selectedChoice = answerMap[question.id]
                  const textValue = textAnswerMap[question.id] ?? ''
                  const isSavingThisQuestion = savingAnswerQuestionId === question.id
                  const itemType = question.item_type ?? 'multiple_choice'

                  return (
                    <Card key={question.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm leading-snug">
                            {questionIndex + 1}. {question.prompt}
                          </CardTitle>
                          <span className="shrink-0 text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                            {itemType === 'true_false' ? 'True/False' : itemType === 'short_answer' ? 'Short Answer' : 'Multiple Choice'}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {itemType === 'true_false' && (
                          <div className="grid grid-cols-2 gap-3">
                            {question.choices.map((choice) => {
                              const isSelected = selectedChoice === choice.original_index
                              const isTrue = choice.text === 'True'
                              return (
                                <button
                                  key={`${question.id}-${choice.rendered_index}`}
                                  type="button"
                                  disabled={disableInteraction}
                                  onClick={() => void handleSelectAnswer(question.id, choice.original_index)}
                                  className={`rounded-xl border-2 py-4 text-sm font-semibold transition ${
                                    isSelected
                                      ? isTrue
                                        ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                                        : 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
                                      : 'border-border hover:border-primary/50'
                                  } ${disableInteraction ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                  {choice.text}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {itemType === 'short_answer' && (
                          <Textarea
                            value={textValue}
                            onChange={(e) =>
                              setTextAnswerMap((prev) => ({ ...prev, [question.id]: e.target.value }))
                            }
                            onBlur={() => void handleTextAnswer(question.id, textValue)}
                            placeholder="Type your answer here…"
                            disabled={disableInteraction}
                            className="resize-none min-h-[100px] text-sm"
                          />
                        )}

                        {itemType === 'multiple_choice' && (
                          question.choices.map((choice) => {
                            const isSelected = selectedChoice === choice.original_index
                            return (
                              <button
                                key={`${question.id}-${choice.rendered_index}`}
                                type="button"
                                disabled={disableInteraction}
                                onClick={() => void handleSelectAnswer(question.id, choice.original_index)}
                                className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                                  isSelected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-primary/50'
                                } ${disableInteraction ? 'opacity-70 cursor-not-allowed' : ''}`}
                              >
                                <span className="font-medium mr-2">{String.fromCharCode(65 + choice.rendered_index)}.</span>
                                {choice.text}
                              </button>
                            )
                          })
                        )}

                        <div className="text-xs text-muted-foreground min-h-4">
                          {isSavingThisQuestion ? 'Saving answer…' : ' '}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <p className="font-semibold text-base">
                      {result.percentage >= 75 ? '🎉 ' : ''}Exam Submitted
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        Score: {result.score.toFixed(2)} / {result.max_score.toFixed(2)}
                      </Badge>
                      <Badge
                        variant={result.percentage >= 75 ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {result.percentage.toFixed(1)}%
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {result.answered_count}/{result.total_questions} answered
                      </Badge>
                      {result.violation_count > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {result.violation_count} violation{result.violation_count !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {result.question_results && result.question_results.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Answer Review</p>
                    {result.question_results.map((qr, qi) => {
                      const answered = qr.selected_choice_index !== null || Boolean(qr.answer_text?.trim())
                      const correct = qr.is_correct === true
                      const incorrect = qr.is_correct === false
                      const pending = qr.is_correct === null && answered

                      return (
                        <Card
                          key={qr.question_id}
                          className={
                            correct
                              ? 'border-green-500/40 bg-green-500/5'
                              : incorrect
                                ? 'border-destructive/40 bg-destructive/5'
                                : 'border-border'
                          }
                        >
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug">
                                {qi + 1}. {qr.prompt}
                              </p>
                              <Badge
                                variant={correct ? 'default' : incorrect ? 'destructive' : 'secondary'}
                                className="shrink-0 text-xs"
                              >
                                {correct
                                  ? `+${qr.points_awarded.toFixed(1)} pts`
                                  : pending
                                    ? 'Pending'
                                    : !answered
                                      ? 'Skipped'
                                      : '0 pts'}
                              </Badge>
                            </div>

                            {qr.item_type === 'short_answer' ? (
                              <div className="space-y-1 text-xs">
                                <p className="text-muted-foreground">
                                  Your answer:{' '}
                                  <span className="text-foreground font-medium">
                                    {qr.answer_text?.trim() || '(no answer)'}
                                  </span>
                                </p>
                                {qr.correct_answer_text && (
                                  <p className="text-muted-foreground">
                                    Accepted:{' '}
                                    <span className="text-green-700 dark:text-green-400 font-medium">
                                      {qr.correct_answer_text}
                                    </span>
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {qr.choices.map((choiceText, ci) => {
                                  const isCorrectAnswer = ci === qr.correct_choice_index
                                  const isStudentAnswer = ci === qr.selected_choice_index
                                  return (
                                    <div
                                      key={ci}
                                      className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                                        isCorrectAnswer
                                          ? 'bg-green-500/10 text-green-700 dark:text-green-400 font-medium'
                                          : isStudentAnswer && !isCorrectAnswer
                                            ? 'bg-destructive/10 text-destructive font-medium'
                                            : 'text-muted-foreground'
                                      }`}
                                    >
                                      <span className="shrink-0 w-4">
                                        {isCorrectAnswer ? '✓' : isStudentAnswer && !isCorrectAnswer ? '✗' : ''}
                                      </span>
                                      <span>{choiceText}</span>
                                      {isStudentAnswer && !isCorrectAnswer && (
                                        <span className="ml-auto text-[10px] opacity-70">your answer</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {qr.explanation && (
                              <p className="text-xs text-muted-foreground border-t border-border/50 pt-2 mt-1">
                                {qr.explanation}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Exit'}
          </Button>
          {!result && (
            <Button
              onClick={() => void submitAttempt('manual')}
              disabled={!session || (!started && !terminated) || submitting}
            >
              {submitting ? 'Submitting...' : terminated ? 'Submit Terminated Attempt' : 'Submit Exam'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
