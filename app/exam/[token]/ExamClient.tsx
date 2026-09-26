'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { exitFullscreen, isFullscreen, requestFullscreen } from '@/lib/fullscreen'
import type { AttemptPayload, TerminationReason } from '@/lib/types'

type QuizMeta = {
  id: number
  title: string
  description: string | null
  is_published: boolean
  lockdown_enabled: boolean
} | null

type Phase = 'landing' | 'starting' | 'taking' | 'completed' | 'terminated' | 'error'

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'You switched tabs or apps.',
  blur: 'You left the exam window.',
  fullscreen_exit: 'You exited fullscreen.',
  devtools: 'A blocked shortcut was used (developer tools).',
}

export function ExamClient(props: { token: string; quiz: QuizMeta }) {
  const { token, quiz } = props

  const [phase, setPhase] = useState<Phase>(quiz?.is_published ? 'landing' : 'error')
  const [name, setName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [error, setError] = useState<string | null>(
    quiz ? null : 'This exam link is invalid.',
  )
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)

  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [idx, setIdx] = useState(0)
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [terminationReason, setTerminationReason] = useState<TerminationReason>(null)

  const terminatedRef = useRef(false)
  const phaseRef = useRef<Phase>(phase)
  const attemptIdRef = useRef<number | null>(null)
  const startingRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const lockdownOn = !!quiz?.lockdown_enabled

  const finishWithViolation = useCallback(async (type: string) => {
    if (terminatedRef.current || phaseRef.current !== 'taking' || !attemptIdRef.current) return
    terminatedRef.current = true

    const supabase = createClient()
    const { data } = await supabase.rpc('report_violation', {
      p_attempt_id: attemptIdRef.current,
      p_type: type,
    })

    await exitFullscreen()

    setAttempt(data as AttemptPayload)
    setTerminationReason(type as TerminationReason)
    setPhase('terminated')
  }, [])

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
      if (!isFullscreen()) finishWithViolation('fullscreen_exit')
    }
    function onKeyDown(e: KeyboardEvent) {
      const blocked =
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) ||
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
  }, [lockdownOn, phase, finishWithViolation])

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
    if (!quiz || !name.trim() || startingRef.current) return
    startingRef.current = true
    try {
      setError(null)
      setFullscreenError(null)
      setPhase('starting')

      if (lockdownOn) {
        try {
          await requestFullscreen()
        } catch {
          setFullscreenError(
            'Your browser blocked fullscreen. Please allow it and try again — fullscreen is required for this exam.',
          )
          setPhase('landing')
          return
        }
      }

      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInAnonymously()
      if (signInError) {
        setError(
          'Could not start the exam (anonymous sign-in is unavailable). Please tell your teacher.',
        )
        setPhase('landing')
        await exitFullscreen()
        return
      }

      const { data, error: rpcError } = await supabase.rpc('start_public_attempt', {
        p_share_token: token,
        p_student_name: name.trim(),
        p_student_number: studentNumber.trim() || null,
      })

      if (rpcError) {
        setError(rpcError.message)
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
      setError('Could not start the exam. Please try again or contact your teacher.')
      setPhase('landing')
      await exitFullscreen()
    } finally {
      startingRef.current = false
    }
  }

  async function refresh(attemptId: number) {
    const supabase = createClient()
    const { data } = await supabase.rpc('get_attempt', { p_attempt_id: attemptId })
    setAttempt(data as AttemptPayload)
  }

  const q = attempt?.questions[idx]

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset the textarea when the current question changes
    setTextAnswer(q?.answer_text ?? '')
  }, [q?.id, q?.answer_text])

  async function answer(selectedIndex: number) {
    if (!attempt || submitting || !q) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.rpc('submit_answer', {
      p_attempt_id: attempt.id,
      p_question_id: q.id,
      p_selected_index: selectedIndex,
      p_answer_text: null,
    })
    await refresh(attempt.id)
    setSubmitting(false)
  }

  async function submitTextAnswer() {
    if (!attempt || !q || submitting) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.rpc('submit_answer', {
      p_attempt_id: attempt.id,
      p_question_id: q.id,
      p_selected_index: null,
      p_answer_text: textAnswer,
    })
    await refresh(attempt.id)
    setSubmitting(false)
  }

  async function finishExam() {
    if (!attempt || submitting) return
    setSubmitting(true)
    terminatedRef.current = true
    const supabase = createClient()
    const { data } = await supabase.rpc('complete_attempt', { p_attempt_id: attempt.id })
    await exitFullscreen()
    setAttempt(data as AttemptPayload)
    setPhase('completed')
    setSubmitting(false)
  }

  // ---- Rendering ----

  if (phase === 'error' || !quiz) {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error ?? 'This exam link is invalid.'}
        </div>
      </Shell>
    )
  }

  if (phase === 'terminated') {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">
            Exam ended automatically
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Security violation detected</h1>
          <p className="mt-3 text-sm text-slate-600">
            {VIOLATION_LABELS[terminationReason ?? ''] ?? 'A security rule was triggered.'} Your exam was
            submitted automatically as-is.
          </p>
          {attempt?.score !== null && attempt?.total_questions !== null ? (
            <div className="mt-6 text-3xl font-semibold text-slate-900">
              {attempt?.score}/{attempt?.total_questions}
            </div>
          ) : null}
          <p className="mt-6 text-xs text-slate-400">You may close this window. Contact your teacher if you believe this was a mistake.</p>
        </div>
      </Shell>
    )
  }

  if (phase === 'completed' && attempt) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">Submitted</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exam complete</h1>
          <div className="mt-4 text-4xl font-semibold text-slate-900">
            {attempt.score}/{attempt.total_questions}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Thanks, {attempt.student_name}. You may close this window.
          </p>
        </div>
      </Shell>
    )
  }

  if (phase === 'landing' || phase === 'starting') {
    return (
      <Shell>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">Exam</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{quiz.title}</h1>
        {quiz.description ? <p className="mt-2 text-sm text-slate-500">{quiz.description}</p> : null}
        <p className="mt-4 text-sm text-slate-600">
          Only one attempt per full name is allowed for this quiz, including unfinished attempts.
          Check your name before starting. If you have already started, contact your teacher.
        </p>

        {lockdownOn ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            This exam is locked down: it will open in fullscreen, and switching tabs, switching apps, or
            exiting fullscreen will submit your exam immediately. Close other apps and make sure you have
            time to finish before starting.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
        ) : null}
        {fullscreenError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {fullscreenError}
          </div>
        ) : null}

        <form onSubmit={startExam} className="mt-6 space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Full name</span>
            <input
              required
              disabled={phase === 'starting'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500"
              placeholder="Juan Dela Cruz"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Student ID (optional)</span>
            <input
              disabled={phase === 'starting'}
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-500"
              placeholder="2023-00123"
            />
          </label>
          <button
            disabled={phase === 'starting'}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
          >
            {phase === 'starting' ? 'Starting...' : lockdownOn ? 'Start Exam (Fullscreen)' : 'Start Exam'}
          </button>
        </form>
      </Shell>
    )
  }

  // phase === 'taking'
  if (!attempt || !q) {
    return <Shell><div className="text-sm text-slate-500">Loading...</div></Shell>
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium text-slate-600">
              Question {idx + 1}/{attempt.questions.length}
            </div>
            <div className="text-sm text-slate-500">{attempt.student_name}</div>
          </div>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-violet-600 transition-all"
              style={{ width: `${((idx + 1) / attempt.questions.length) * 100}%` }}
            />
          </div>

          <div className="mt-6 text-xl font-semibold text-slate-900">{q.prompt}</div>

          {q.type === 'multiple_choice' ? (
            <div className="mt-6 space-y-3">
              {(q.options ?? []).map((opt, optIdx) => {
                const selected = q.selected_index === optIdx
                return (
                  <button
                    key={optIdx}
                    disabled={submitting}
                    onClick={() => answer(optIdx)}
                    className={[
                      'w-full rounded-2xl border px-4 py-4 text-left text-sm transition',
                      'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50',
                      selected ? 'border-violet-500 bg-violet-50' : '',
                      submitting ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <textarea
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={submitting}
                placeholder="Type your answer here"
                className="min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 disabled:opacity-60"
              />
              <button
                onClick={submitTextAnswer}
                disabled={submitting || !textAnswer.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
              >
                Save Answer
              </button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
            >
              Previous
            </button>
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                onClick={finishExam}
                disabled={submitting}
              >
                Submit Exam
              </button>
              <button
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                onClick={() => setIdx((i) => Math.min(attempt.questions.length - 1, i + 1))}
                disabled={idx === attempt.questions.length - 1}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell(props: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-6 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        {props.children}
      </div>
    </div>
  )
}
