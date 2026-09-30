'use client'
import { isChoiceQuestion, answerInstructions } from '@/lib/questions'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  exitFullscreen,
  fullscreenAvailability,
  isFullscreen,
  requestFullscreen,
} from '@/lib/fullscreen'
import type {
  AttemptPayload,
  ClassSection,
  TerminationReason,
} from '@/lib/types'
import { useFeedback, useNotify } from '@/components/Notifications'
import { AttemptTimer } from '@/components/AttemptTimer'
import { Brand } from '@/components/AppShell'

type QuizMeta = {
  id: number
  title: string
  description: string | null
  is_published: boolean
  time_limit_minutes: number | null
  lockdown_enabled: boolean
} | null

type Phase =
  'landing' | 'starting' | 'taking' | 'completed' | 'terminated' | 'error'

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'You switched tabs or apps.',
  blur: 'You left the exam window.',
  fullscreen_exit: 'You exited fullscreen.',
  devtools: 'A blocked shortcut was used (developer tools).',
}

export function ExamClient(props: {
  token: string
  quiz: QuizMeta
  classes: ClassSection[]
}) {
  const { token, quiz } = props
  const feedback = useFeedback()
  const notify = useNotify()

  const [phase, setPhase] = useState<Phase>(
    quiz?.is_published ? 'landing' : 'error',
  )
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [classId, setClassId] = useState(
    props.classes.length === 1 ? String(props.classes[0].id) : '',
  )
  const [error, setError] = useState<string | null>(
    quiz ? null : 'This exam link is invalid.',
  )
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [fullscreenEnforced, setFullscreenEnforced] = useState(false)

  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [idx, setIdx] = useState(0)
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [terminationReason, setTerminationReason] =
    useState<TerminationReason>(null)

  const [warning, setWarning] = useState<{
    type: string
    eventId: string
    count: number
    failed: boolean
  } | null>(null)
  const [warningBusy, setWarningBusy] = useState(false)
  const terminatedRef = useRef(false)
  const phaseRef = useRef<Phase>(phase)
  const attemptIdRef = useRef<number | null>(null)
  const startingRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const lockdownOn = !!quiz?.lockdown_enabled

  const recordViolation = useCallback(async (type: string, eventId: string) => {
    setWarningBusy(true)
    try {
      const { data, error } = await createClient().rpc('report_violation', {
        p_attempt_id: attemptIdRef.current,
        p_type: type,
        p_event_id: eventId,
      })
      if (error) throw error
      const result = data as AttemptPayload
      setAttempt(result)
      if (result.completed_at) {
        setWarning(null)
        setTerminationReason(result.termination_reason)
        setPhase(
          result.termination_reason === 'time_expired'
            ? 'completed'
            : 'terminated',
        )
        await exitFullscreen()
      } else {
        setWarning({
          type,
          eventId,
          count: result.violation_count,
          failed: false,
        })
      }
    } catch {
      setWarning({ type, eventId, count: 0, failed: true })
    } finally {
      setWarningBusy(false)
    }
  }, [])

  const finishWithViolation = useCallback(
    (type: string) => {
      if (
        terminatedRef.current ||
        phaseRef.current !== 'taking' ||
        !attemptIdRef.current
      )
        return
      // One incident can emit blur, visibilitychange and fullscreenchange together.
      // Keep it latched until the student acknowledges the recorded warning.
      terminatedRef.current = true
      const eventId = crypto.randomUUID()
      setWarning({ type, eventId, count: 0, failed: false })
      void recordViolation(type, eventId)
    },
    [recordViolation],
  )

  async function acknowledgeWarning() {
    if (warningBusy || warning?.failed || document.hidden) return
    setWarningBusy(true)
    if (fullscreenEnforced && !isFullscreen()) {
      try {
        await requestFullscreen()
      } catch {
        setFullscreenEnforced(false)
      }
    }
    setWarning(null)
    terminatedRef.current = false
    setWarningBusy(false)
  }

  // Lockdown listeners — only active while actively taking a lockdown exam.
  useEffect(() => {
    if (!lockdownOn || phase !== 'taking') return

    function onVisibility() {
      if (document.hidden) finishWithViolation('tab_switch')
    }
    function onBlur() {
      finishWithViolation('blur')
    }
    function onFullscreenChange() {
      if (fullscreenEnforced && !isFullscreen())
        finishWithViolation('fullscreen_exit')
    }
    function onKeyDown(e: KeyboardEvent) {
      const blocked =
        e.key === 'F12' ||
        (e.ctrlKey &&
          e.shiftKey &&
          ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))
      if (blocked) {
        e.preventDefault()
        finishWithViolation('devtools')
      }
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault()
    }
    function onCopyCutPaste(e: ClipboardEvent) {
      e.preventDefault()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('copy', onCopyCutPaste)
    document.addEventListener('cut', onCopyCutPaste)
    document.addEventListener('paste', onCopyCutPaste)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('copy', onCopyCutPaste)
      document.removeEventListener('cut', onCopyCutPaste)
      document.removeEventListener('paste', onCopyCutPaste)
    }
  }, [lockdownOn, phase, finishWithViolation, fullscreenEnforced])

  // Warn on refresh/close while an exam is in progress (best-effort only).
  useEffect(() => {
    if (phase !== 'taking') return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

  async function startExam(e: FormEvent) {
    e.preventDefault()
    if (
      !quiz ||
      !firstName.trim() ||
      !lastName.trim() ||
      !classId ||
      startingRef.current
    )
      return
    const submitter = (e.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null
    const withoutFullscreen =
      submitter?.value === 'windowed' && !!fullscreenError
    startingRef.current = true
    try {
      setError(null)
      setFullscreenError(null)
      setPhase('starting')
      setFullscreenEnforced(false)

      if (lockdownOn && !withoutFullscreen) {
        const availability = fullscreenAvailability()
        if (availability !== 'available') {
          setFullscreenError(
            availability === 'unsupported'
              ? 'This browser does not support fullscreen for exams. You can start without fullscreen below. Keep this tab open and stay in the browser. Your attempt has not started.'
              : 'Fullscreen is unavailable in this browser window. Open the link directly in your browser and retry, or start without fullscreen below. Your attempt has not started.',
          )
          setPhase('landing')
          return
        }
        try {
          await requestFullscreen()
          if (!isFullscreen()) throw new Error('Fullscreen did not open')
          setFullscreenEnforced(true)
        } catch {
          setFullscreenError(
            'Fullscreen did not open. Tap Start Exam to request it again, and allow it if your browser asks. You can also start without fullscreen below. Your attempt has not started.',
          )
          setPhase('landing')
          return
        }
      }

      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const { error: signInError } = sessionData.session?.user.is_anonymous
        ? { error: null }
        : await supabase.auth.signInAnonymously()
      if (signInError) {
        setError(
          'Could not start the exam (anonymous sign-in is unavailable). Please tell your teacher.',
        )
        setPhase('landing')
        await exitFullscreen()
        return
      }

      const { data, error: rpcError } = await supabase.rpc(
        'start_public_attempt',
        {
          p_share_token: token,
          p_class_id: Number(classId),
          p_first_name: firstName.trim(),
          p_last_name: lastName.trim(),
        },
      )

      if (rpcError) {
        setError(rpcError.message)
        notify(rpcError.message, 'error')
        setPhase('landing')
        await exitFullscreen()
        return
      }

      const payload = data as AttemptPayload
      attemptIdRef.current = payload.id
      setAttempt(payload)
      setIdx(0)
      setTextAnswer('')
      setPhase('taking')
    } catch {
      setError(
        'Could not start the exam. Please try again or contact your teacher.',
      )
      setPhase('landing')
      await exitFullscreen()
    } finally {
      startingRef.current = false
    }
  }

  async function refresh(attemptId: number) {
    const { data, error } = await createClient().rpc('get_attempt', {
      p_attempt_id: attemptId,
    })
    if (error) throw error
    const result = data as AttemptPayload
    setAttempt(result)
    if (result.completed_at) {
      terminatedRef.current = true
      setPhase('completed')
      await exitFullscreen()
    }
  }
  const q = attempt?.questions[idx]
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the editor with the saved answer
    setTextAnswer(q?.answer_text ?? '')
  }, [q?.id, q?.answer_text])

  async function saveAnswer(selectedIndex: number | null, text: string | null) {
    if (!attempt || !q) return
    const { data, error } = await createClient().rpc('submit_answer', {
      p_attempt_id: attempt.id,
      p_question_id: q.id,
      p_selected_index: selectedIndex,
      p_answer_text: text,
    })
    if (error) throw error
    if (data?.expired) {
      await refresh(attempt.id)
      throw new Error(
        'Time is up. Your previously saved answers were submitted.',
      )
    }
  }
  async function answer(selectedIndex: number) {
    if (!attempt || submitting || !q || terminatedRef.current) return
    setSubmitting(true)
    await feedback(async () => {
      await saveAnswer(selectedIndex, null)
      await refresh(attempt.id)
    }, 'Answer saved.')
    setSubmitting(false)
  }
  async function submitTextAnswer() {
    if (!attempt || !q || submitting || terminatedRef.current) return
    setSubmitting(true)
    await feedback(async () => {
      await saveAnswer(null, textAnswer)
      await refresh(attempt.id)
    }, 'Answer saved.')
    setSubmitting(false)
  }
  async function finishExam() {
    if (!attempt || submitting) return
    setSubmitting(true)
    const saved = await feedback(async () => {
      if (
        !terminatedRef.current &&
        !terminationReason &&
        q &&
        !isChoiceQuestion(q.type) &&
        textAnswer.trim()
      )
        await saveAnswer(null, textAnswer)
      const { data, error } = await createClient().rpc('complete_attempt', {
        p_attempt_id: attempt.id,
      })
      if (error) throw error
      terminatedRef.current = true
      setAttempt(data as AttemptPayload)
      setPhase(
        terminationReason &&
          (data as AttemptPayload).termination_reason !== 'time_expired'
          ? 'terminated'
          : 'completed',
      )
      await exitFullscreen()
    }, 'Exam submitted successfully.')
    if (saved) setError(null)
    setSubmitting(false)
  }

  // ---- Rendering ----

  if (phase === 'error' || !quiz) {
    return (
      <Shell>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error ?? 'This exam link is invalid.'}
        </div>
      </Shell>
    )
  }

  if (phase === 'terminated') {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.1em] text-red-600">
            Exam ended automatically
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Security violation detected
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {VIOLATION_LABELS[terminationReason ?? ''] ??
              'A security rule was triggered.'}{' '}
            Your exam was submitted automatically as-is.
          </p>
          {attempt?.score !== null && attempt?.total_questions !== null ? (
            <div className="mt-6 text-3xl font-semibold text-slate-900">
              {attempt?.score}/{attempt?.total_questions}
            </div>
          ) : null}
          <p className="mt-6 text-xs text-slate-400">
            You may close this window. Contact your teacher if you believe this
            was a mistake.
          </p>
        </div>
      </Shell>
    )
  }

  if (phase === 'completed' && attempt) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.1em] text-emerald-600">
            Submitted
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Exam complete
          </h1>
          <div className="mt-4 text-4xl font-semibold text-slate-900">
            {attempt.score}/{attempt.total_questions}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            {attempt.termination_reason === 'time_expired'
              ? 'Time is up. Your saved answers were submitted automatically. '
              : ''}
            Thanks, {attempt.student_name}. You may close this window.
          </p>
        </div>
      </Shell>
    )
  }

  if (phase === 'landing' || phase === 'starting') {
    return (
      <Shell>
        <div className="text-sm font-semibold uppercase tracking-[0.1em] text-emerald-600">
          Exam
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {quiz.title}
        </h1>
        {quiz.description ? (
          <p className="mt-2 text-sm text-slate-500">{quiz.description}</p>
        ) : null}
        <p className="mt-4 text-sm text-slate-600">
          Only registered students in an assigned class can take this quiz. One
          attempt per student is allowed, including unfinished attempts. Check
          your name before starting. If you have already started, contact your
          teacher.
        </p>

        {lockdownOn ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            This exam monitors tab and app switching. You receive two warnings;
            the third violation submits your saved answers automatically. We’ll
            request fullscreen when you start. If your browser cannot open it,
            you can continue without fullscreen. If fullscreen opens, exiting it
            also counts as a violation. Close other apps before starting.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        ) : null}
        {fullscreenError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {fullscreenError}
          </div>
        ) : null}

        {quiz.time_limit_minutes && (
          <p className="mt-4 text-sm font-medium">
            Time limit: {quiz.time_limit_minutes} minutes. The timer starts when
            your attempt begins. Save each answer; saved answers are submitted
            when time runs out.
          </p>
        )}
        {!props.classes.length && (
          <p role="alert" className="mt-4 text-sm text-amber-700">
            Your teacher has not assigned any classes to this quiz yet. Please
            contact them before starting.
          </p>
        )}
        <form onSubmit={startExam} className="mt-6 space-y-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Class / section
            <select
              required
              value={classId}
              disabled={phase === 'starting'}
              onChange={(e) => setClassId(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="">Choose your class</option>
              {props.classes.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">
              First name
            </span>
            <input
              required
              disabled={phase === 'starting'}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500"
              placeholder="Juan"
              maxLength={100}
              autoComplete="given-name"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">
              Last name
            </span>
            <input
              disabled={phase === 'starting'}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500"
              placeholder="Dela Cruz"
              required
              maxLength={100}
              autoComplete="family-name"
            />
          </label>
          <button
            disabled={phase === 'starting'}
            className="btn btn-primary w-full disabled:opacity-60"
          >
            {phase === 'starting'
              ? 'Starting...'
              : lockdownOn
                ? 'Start Exam (Fullscreen)'
                : 'Start Exam'}
          </button>
          {lockdownOn && fullscreenError && (
            <button
              type="submit"
              value="windowed"
              disabled={phase === 'starting'}
              className="btn btn-secondary w-full disabled:opacity-60"
            >
              Start without fullscreen
            </button>
          )}
        </form>
      </Shell>
    )
  }

  // phase === 'taking'
  if (!attempt || !q) {
    return (
      <Shell>
        <div className="text-sm text-slate-500">Loading...</div>
      </Shell>
    )
  }

  return (
    <div className="exam-shell">
      <div className="exam-brandbar">
        <Brand />
        <span>
          {lockdownOn
            ? fullscreenEnforced
              ? 'Fullscreen exam'
              : 'Monitored exam'
            : 'Student exam'}
        </span>
      </div>
      <main className="exam-taking">
        {warning && (
          <LockdownWarning
            warning={warning}
            busy={warningBusy}
            onContinue={() => void acknowledgeWarning()}
            onRetry={() => void recordViolation(warning.type, warning.eventId)}
          />
        )}
        {lockdownOn && (
          <p className="text-sm text-slate-500">
            Warnings: {Math.min(attempt.violation_count ?? 0, 2)} / 2 · Third
            violation submits the exam.
          </p>
        )}
        <AttemptTimer
          attempt={attempt}
          onDeadline={() => {
            terminatedRef.current = true
            setSubmitting(true)
          }}
          onComplete={(result) => {
            terminatedRef.current = true
            setAttempt(result)
            setPhase('completed')
            setSubmitting(false)
            void exitFullscreen()
          }}
        />
        <header className="exam-taking-heading">
          <span className="eyebrow">Your exam</span>
          <h1>{quiz.title}</h1>
        </header>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        <div className="exam-paper">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-slate-600">
              Question {idx + 1}/{attempt.questions.length}
            </div>
            <div className="text-sm text-slate-500">{attempt.student_name}</div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-emerald-600 transition-all"
              style={{
                width: `${((idx + 1) / attempt.questions.length) * 100}%`,
              }}
            />
          </div>

          <div className="mt-6 text-xl font-semibold text-slate-900">
            {q.prompt}
          </div>

          {isChoiceQuestion(q.type) ? (
            <div className="mt-6 space-y-3">
              {(q.options ?? []).map((opt, optIdx) => {
                const selected = q.selected_index === optIdx
                return (
                  <button
                    key={optIdx}
                    aria-pressed={selected}
                    disabled={submitting || !!terminationReason}
                    onClick={() => answer(optIdx)}
                    className={[
                      'answer-option w-full rounded-md border px-4 py-4 text-left text-sm transition',
                      'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50',
                      selected ? 'border-emerald-500 bg-emerald-50' : '',
                      submitting ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    <span className="answer-letter" aria-hidden="true">
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{opt}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <p className="text-xs text-slate-500">
                {answerInstructions(q?.type ?? 'identification')}
              </p>
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={submitting || !!terminationReason}
                aria-label={
                  q?.type === 'enumeration'
                    ? 'Enumeration answers'
                    : 'Your answer'
                }
                placeholder={
                  q?.type === 'enumeration'
                    ? 'First answer\nSecond answer\nThird answer'
                    : 'Type your answer here'
                }
                className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 disabled:opacity-60"
              />
              <button
                onClick={submitTextAnswer}
                disabled={
                  submitting || !!terminationReason || !textAnswer.trim()
                }
                className="btn btn-primary disabled:opacity-50"
              >
                Save Answer
              </button>
            </div>
          )}

          <div className="exam-navigation mt-6 flex items-center justify-between gap-3">
            <button
              className="btn disabled:opacity-50"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={submitting || !!terminationReason || idx === 0}
            >
              Previous
            </button>
            <div className="flex items-center gap-3">
              <button
                className="btn disabled:opacity-50"
                onClick={finishExam}
                disabled={submitting}
              >
                Submit Exam
              </button>
              <button
                className="btn btn-primary disabled:opacity-50"
                onClick={() =>
                  setIdx((i) => Math.min(attempt.questions.length - 1, i + 1))
                }
                disabled={
                  submitting ||
                  !!terminationReason ||
                  idx === attempt.questions.length - 1
                }
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function Shell(props: { children: React.ReactNode }) {
  return (
    <div className="exam-shell">
      <div className="exam-brandbar">
        <Brand />
        <span>Student exam</span>
      </div>
      <main className="exam-entry">{props.children}</main>
      <p className="exam-caption">
        Take your time. Read each question carefully.
      </p>
    </div>
  )
}

function LockdownWarning({
  warning,
  busy,
  onContinue,
  onRetry,
}: {
  warning: { type: string; count: number; failed: boolean }
  busy: boolean
  onContinue: () => void
  onRetry: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="roster-dialog"
      aria-labelledby="lockdown-warning-title"
      onCancel={(e) => e.preventDefault()}
    >
      <h2 id="lockdown-warning-title" className="text-xl font-semibold">
        {busy
          ? 'Recording warning…'
          : warning.failed
            ? 'Connection interrupted'
            : 'Warning ' + warning.count + ' of 2'}
      </h2>
      <p className="my-4 text-sm">
        {warning.failed
          ? 'We could not record this event. Reconnect and retry to continue. Your answers remain locked and the timer keeps running.'
          : VIOLATION_LABELS[warning.type]}
      </p>
      {!warning.failed && (
        <p className="mb-5 text-sm">
          {warning.count === 2
            ? 'This is your final warning. The next violation will submit your saved answers automatically.'
            : 'Stay in this exam. The third violation will submit your saved answers automatically.'}{' '}
          The timer continues during warnings.
        </p>
      )}
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={warning.failed ? onRetry : onContinue}
      >
        {warning.failed ? 'Retry' : 'I understand — continue exam'}
      </button>
    </dialog>
  )
}
