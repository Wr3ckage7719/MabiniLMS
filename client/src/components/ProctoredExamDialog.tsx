import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock, Flag, Loader2, ShieldAlert, X } from 'lucide-react'
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
  mode?: 'quiz' | 'exam'
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
  mode = 'exam',
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
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const isAttemptActive = session?.attempt.status === 'active' && !result && !terminated
  const isQuizMode = mode === 'quiz'
  const isOneAtATime = Boolean(session?.policy.one_question_at_a_time)
  const lastViolationAtRef = useRef<Record<string, number>>({})
  const timeoutSubmitInFlightRef = useRef(false)
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({})

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
    setFlaggedQuestions(new Set())
    setCurrentQuestionIndex(0)
    setSubmitError(null)
    setConfirmSubmit(false)
    lastViolationAtRef.current = {}
    timeoutSubmitInFlightRef.current = false
    questionRefs.current = {}
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
        || 'Failed to load session'

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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open && !started) {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, started, onOpenChange])

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
            void document.exitFullscreen().catch(() => {})
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

    if (!isQuizMode && session.assignment.is_proctored) {
      await enterFullscreen()
    }

    setStarted(true)
  }, [agreementChecked, enterFullscreen, isQuizMode, session, toast])

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
      setSubmitError(null)
      try {
        // Flush any unsaved text answers. The textarea normally saves
        // onBlur, but when the user clicks Submit directly from the
        // textarea the blur and submit can race — so push every typed
        // text answer to the server before finalizing the attempt.
        const pendingTextSaves = Object.entries(textAnswerMap)
          .map(([questionId, text]) => [questionId, text.trim()] as const)
          .filter(([, text]) => text.length > 0)
          .map(([questionId, text]) =>
            examsService
              .submitExamAnswer(session.attempt.id, {
                question_id: questionId,
                answer_text: text,
              })
              .catch(() => {
                // best-effort flush; the final submit still proceeds
              })
          )
        if (pendingTextSaves.length > 0) {
          await Promise.all(pendingTextSaves)
        }

        const submitted = await examsService.submitExamAttempt(session.attempt.id)
        setResult(submitted)
        setStarted(false)
        setConfirmSubmit(false)

        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {})
        }

        void queryClient.invalidateQueries({ queryKey: ['my-grades'] })
        void queryClient.invalidateQueries({ queryKey: ['weighted-course-grade'] })

        toast({
          title: reason === 'timeout' ? 'Time expired' : isQuizMode ? 'Quiz submitted' : 'Exam submitted',
          description: `Score: ${submitted.score.toFixed(2)} / ${submitted.max_score.toFixed(2)} (${submitted.percentage.toFixed(2)}%)`,
        })
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message
          || error?.response?.data?.message
          || error?.message
          || `Failed to submit ${isQuizMode ? 'quiz' : 'exam'} attempt`
        setSubmitError(message)
        toast({
          title: 'Submission failed',
          description: message,
          variant: 'destructive',
        })
      } finally {
        setSubmitting(false)
        timeoutSubmitInFlightRef.current = false
      }
    },
    [isQuizMode, queryClient, result, session, submitting, textAnswerMap, toast]
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
    if (!session || !started || !isAttemptActive) {
      return
    }

    // Tab-switch / window-blur detection runs for every active attempt
    // (proctored exam OR proctored quiz). Browsers don't always fire
    // `visibilitychange` when alt-tabbing between windows, so we also
    // listen to `blur` as a secondary signal.
    const onVisibilityChange = () => {
      if (document.hidden) {
        void reportViolation('visibility_hidden', { source: 'visibilitychange' })
      }
    }

    const onWindowBlur = () => {
      // Ignore blur events while focus is moving to a child element of
      // the dialog itself (e.g. focusing an input). Only treat as a tab
      // switch when the document genuinely loses focus.
      if (document.hasFocus()) {
        return
      }
      void reportViolation('visibility_hidden', { source: 'window_blur' })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)

    // The remaining policy-gated guards (fullscreen, clipboard, context
    // menu, devtools, print) only attach when proctoring is enabled.
    const proctoringEnabled = session.assignment.is_proctored && !isQuizMode

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
      // Block Ctrl+F (browser find) and Ctrl+U (view source) — both
      // commonly used to escape an exam to web search.
      if (session.policy.block_clipboard && metaKey && (event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'u')) {
        event.preventDefault()
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

    if (proctoringEnabled) {
      document.addEventListener('fullscreenchange', onFullscreenChange)
      window.addEventListener('contextmenu', onContextMenu)
      window.addEventListener('copy', onCopy)
      window.addEventListener('paste', onPaste)
      window.addEventListener('cut', onCut)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('resize', onWindowResize)
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onWindowBlur)
      if (proctoringEnabled) {
        document.removeEventListener('fullscreenchange', onFullscreenChange)
        window.removeEventListener('contextmenu', onContextMenu)
        window.removeEventListener('copy', onCopy)
        window.removeEventListener('paste', onPaste)
        window.removeEventListener('cut', onCut)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('resize', onWindowResize)
      }
    }
  }, [isAttemptActive, isQuizMode, reportViolation, session, started])

  const scrollToQuestion = useCallback((questionId: string) => {
    questionRefs.current[questionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const toggleFlag = useCallback((questionId: string) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }, [])

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

  const label = isQuizMode ? 'Quiz' : 'Proctored Exam'

  if (!open) return null

  // While an attempt is in progress, prevent text selection on the
  // exam content. This blocks "highlight → right-click → search Google"
  // and similar selection-based escape paths to web search. Form inputs
  // (textarea / input) opt back in via `select-text` so students can
  // still edit their own answers.
  const lockSelection = started && isAttemptActive

  return (
    <div
      className={`fixed inset-0 z-[130] bg-background flex flex-col ${lockSelection ? 'select-none' : ''}`}
      onDragStart={lockSelection ? (event) => event.preventDefault() : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6 md:py-4 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
            {label}: {assignmentTitle}
          </h2>
          {!isQuizMode && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {session?.assignment.is_proctored
                ? 'Proctored — screen activity is monitored during your attempt.'
                : 'Exam mode active without strict proctoring restrictions.'}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full flex-shrink-0"
          onClick={() => {
            if (started && isAttemptActive && !result) {
              const ok = window.confirm(
                `Leave ${label.toLowerCase()} without submitting? Your answers are saved automatically — you can resume later.`
              )
              if (!ok) return
            }
            onOpenChange(false)
          }}
          title="Close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-3xl space-y-4">

          {loadingSession && (
            <div className="flex items-center justify-center py-12">
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
              {/* Stats bar */}
              <div className="flex flex-col gap-3 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs rounded-md bg-secondary px-2 py-1">
                    Questions: {session.questions.length}
                  </span>
                  <span className="text-xs rounded-md bg-secondary px-2 py-1">
                    Max score: {session.assignment.max_points}
                  </span>
                  {!isQuizMode && (
                    <span className="text-xs rounded-md bg-secondary px-2 py-1">
                      Violations: {violationCount}
                    </span>
                  )}
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

              {/* Active proctoring warning (exam only) */}
              {!isQuizMode && session.assignment.is_proctored && started && (
                <Card className="border-yellow-500/40 bg-yellow-500/10">
                  <CardContent className="p-3 text-xs text-yellow-100 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Proctoring is active. Right-click, clipboard, print shortcut, tab switch, and fullscreen
                      exits are all tracked and recorded.
                    </span>
                  </CardContent>
                </Card>
              )}

              {/* Terminated notice */}
              {terminated && (
                <Card className="border-destructive/40 bg-destructive/10">
                  <CardContent className="p-3 text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>This attempt was terminated due to policy violations. Submit now to finalize your current answers.</span>
                  </CardContent>
                </Card>
              )}

              {/* Pre-start instructions */}
              {!started && !result && (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {isQuizMode ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Before you begin</p>
                        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
                          <li>Answer each question by selecting the best choice.</li>
                          <li>Your answers are saved automatically as you go — no need to worry about losing progress.</li>
                          <li>{session.assignment.exam_duration_minutes
                            ? `You have ${session.assignment.exam_duration_minutes} minute${session.assignment.exam_duration_minutes !== 1 ? 's' : ''} to complete this quiz.`
                            : 'There is no time limit for this quiz.'}</li>
                          <li>Once you click <strong>Submit Quiz</strong>, your answers are final and cannot be changed.</li>
                          <li>You can review your answers before submitting.</li>
                        </ul>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Before you begin</p>
                        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
                          <li>This is a <strong>proctored exam</strong>. Your screen activity will be monitored.</li>
                          <li>You will be placed in fullscreen mode when the exam starts — do not exit it.</li>
                          <li>Switching tabs, copying text, right-clicking, or exiting fullscreen are all recorded as violations.</li>
                          <li>Too many violations may automatically submit or terminate your attempt.</li>
                          {session.assignment.exam_duration_minutes
                            ? <li>You have <strong>{session.assignment.exam_duration_minutes} minute{session.assignment.exam_duration_minutes !== 1 ? 's' : ''}</strong> to complete this exam. It will auto-submit when time runs out.</li>
                            : <li>There is no time limit, but you must stay in the exam window until you submit.</li>}
                          <li>Once submitted, your answers are final.</li>
                        </ul>
                      </div>
                    )}

                    {Boolean(session.policy.require_agreement_before_start) && (
                      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <Checkbox
                          id="exam-agreement"
                          checked={agreementChecked}
                          onCheckedChange={(checked) => setAgreementChecked(Boolean(checked))}
                        />
                        <label htmlFor="exam-agreement" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                          {isQuizMode
                            ? 'I understand the instructions above and am ready to begin the quiz.'
                            : 'I agree to stay in this exam tab, keep fullscreen active, and follow all proctoring rules.'}
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
                      {isQuizMode ? 'Start Quiz' : 'Begin Exam'}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Questions */}
              {started && !result && (
                isOneAtATime ? (
                  /* ── One-at-a-time mode ── */
                  <div className="space-y-3">
                    {/* Progress header */}
                    <div className="flex items-center justify-between rounded-xl border bg-background/95 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Question {currentQuestionIndex + 1} <span className="font-normal text-muted-foreground">of {session.questions.length}</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {session.questions.map((q, qi) => {
                          const answered = answerMap[q.id] !== undefined || Boolean(textAnswerMap[q.id]?.trim())
                          const flagged = flaggedQuestions.has(q.id)
                          const isCurrent = qi === currentQuestionIndex
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => setCurrentQuestionIndex(qi)}
                              className={`w-6 h-6 text-[10px] font-semibold rounded-md border transition ${
                                isCurrent
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : flagged
                                  ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  : answered
                                  ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                                  : 'border-border text-muted-foreground hover:border-primary/50'
                              }`}
                              title={`Q${qi + 1}${answered ? ' (answered)' : ''}${flagged ? ' (flagged)' : ''}`}
                            >
                              {qi + 1}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Single question card */}
                    {(() => {
                      const question = session.questions[currentQuestionIndex]
                      if (!question) return null
                      const selectedChoice = answerMap[question.id]
                      const textValue = textAnswerMap[question.id] ?? ''
                      const isSavingThisQuestion = savingAnswerQuestionId === question.id
                      const itemType = question.item_type ?? 'multiple_choice'
                      const isFlagged = flaggedQuestions.has(question.id)
                      return (
                        <Card className={isFlagged ? 'border-amber-500/40' : ''}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm leading-snug">
                                {currentQuestionIndex + 1}. {question.prompt}
                              </CardTitle>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                                  {itemType === 'true_false' ? 'True/False' : itemType === 'short_answer' ? 'Short Answer' : 'Multiple Choice'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleFlag(question.id)}
                                  className={`p-1 rounded transition ${isFlagged ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`}
                                  title={isFlagged ? 'Remove flag' : 'Flag for review'}
                                >
                                  <Flag className="h-3.5 w-3.5" fill={isFlagged ? 'currentColor' : 'none'} />
                                </button>
                              </div>
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
                                className="resize-none min-h-[100px] text-sm select-text"
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
                    })()}

                    {/* Prev / Next navigation */}
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentQuestionIndex === 0}
                        onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                      >
                        ← Previous
                      </Button>
                      {currentQuestionIndex < session.questions.length - 1 && (
                        <Button
                          size="sm"
                          onClick={() => setCurrentQuestionIndex((i) => Math.min(session.questions.length - 1, i + 1))}
                        >
                          Next →
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── All-at-once mode ── */
                  <div className="space-y-3">
                    <div className="sticky top-0 z-10 rounded-xl border bg-background/95 backdrop-blur p-2">
                      <p className="text-[10px] text-muted-foreground mb-1.5 px-0.5">Jump to question</p>
                      <div className="flex flex-wrap gap-1.5">
                        {session.questions.map((q, qi) => {
                          const answered = answerMap[q.id] !== undefined || Boolean(textAnswerMap[q.id]?.trim())
                          const flagged = flaggedQuestions.has(q.id)
                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => scrollToQuestion(q.id)}
                              className={`w-7 h-7 text-xs font-semibold rounded-md border transition ${
                                flagged
                                  ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  : answered
                                    ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                                    : 'border-border text-muted-foreground hover:border-primary/50'
                              }`}
                              title={`Q${qi + 1}${answered ? ' (answered)' : ''}${flagged ? ' (flagged)' : ''}`}
                            >
                              {qi + 1}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 px-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="w-2.5 h-2.5 rounded-sm bg-green-500/20 border border-green-500/60 inline-block" />
                          Answered
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/60 inline-block" />
                          Flagged
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="w-2.5 h-2.5 rounded-sm border border-border inline-block" />
                          Unanswered
                        </span>
                      </div>
                    </div>

                    {session.questions.map((question, questionIndex) => {
                      const selectedChoice = answerMap[question.id]
                      const textValue = textAnswerMap[question.id] ?? ''
                      const isSavingThisQuestion = savingAnswerQuestionId === question.id
                      const itemType = question.item_type ?? 'multiple_choice'
                      const isFlagged = flaggedQuestions.has(question.id)

                      return (
                        <div
                          key={question.id}
                          ref={(el) => { questionRefs.current[question.id] = el }}
                          className="scroll-mt-36"
                        >
                        <Card className={isFlagged ? 'border-amber-500/40' : ''}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm leading-snug">
                                {questionIndex + 1}. {question.prompt}
                              </CardTitle>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                                  {itemType === 'true_false' ? 'True/False' : itemType === 'short_answer' ? 'Short Answer' : 'Multiple Choice'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleFlag(question.id)}
                                  className={`p-1 rounded transition ${isFlagged ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`}
                                  title={isFlagged ? 'Remove flag' : 'Flag for review'}
                                >
                                  <Flag className="h-3.5 w-3.5" fill={isFlagged ? 'currentColor' : 'none'} />
                                </button>
                              </div>
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
                                className="resize-none min-h-[100px] text-sm select-text"
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
                        </div>
                      )
                    })}
                  </div>
                )
              )}

              {/* Result */}
              {result && (
                <div className="space-y-4">
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 space-y-2 text-sm">
                      <p className="font-semibold text-base">
                        {result.percentage >= 75 ? '🎉 ' : ''}{isQuizMode ? 'Quiz Submitted' : 'Exam Submitted'}
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
                        {!isQuizMode && result.violation_count > 0 && (
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
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 md:px-6 md:py-4 flex-shrink-0">
        <Button
          variant="outline"
          onClick={() => {
            if (started && isAttemptActive && !result) {
              const ok = window.confirm(
                `Leave ${label.toLowerCase()} without submitting? Your answers are saved automatically — you can resume later.`
              )
              if (!ok) return
            }
            onOpenChange(false)
          }}
        >
          {result ? 'Close' : 'Exit'}
        </Button>
        {!result && (
          <Button
            onClick={() => {
              setSubmitError(null)
              setConfirmSubmit(true)
            }}
            disabled={!session || (!started && !terminated) || submitting}
          >
            {submitting
              ? 'Submitting...'
              : terminated
              ? 'Submit Terminated Attempt'
              : isQuizMode
              ? 'Submit Quiz'
              : 'Submit Exam'}
          </Button>
        )}
      </div>

      {confirmSubmit && !result && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl border border-border">
            <h3 className="text-base font-semibold mb-2">
              {isQuizMode ? 'Submit Quiz?' : 'Submit Exam?'}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              You have answered <strong>{answeredCount}</strong> of <strong>{session?.questions.length ?? 0}</strong> questions.
              {session && session.questions.length > answeredCount && (
                <> {session.questions.length - answeredCount} unanswered.</>
              )}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Once submitted, your answers are final and cannot be changed.
            </p>
            {submitError && (
              <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {submitError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmSubmit(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void submitAttempt('manual')}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : isQuizMode ? 'Submit Quiz' : 'Submit Exam'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {submitError && !confirmSubmit && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[140] max-w-lg w-[92vw] rounded-xl border border-destructive/40 bg-destructive/10 p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-xs text-destructive">
              <p className="font-semibold mb-0.5">Submission failed</p>
              <p>{submitError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-destructive/70 hover:text-destructive text-xs"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
