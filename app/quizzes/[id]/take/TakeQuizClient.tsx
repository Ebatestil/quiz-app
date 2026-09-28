'use client'
import { isChoiceQuestion, answerInstructions } from '@/lib/questions'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Surface } from '@/components/AppShell'
import { useFeedback } from '@/components/Notifications'
import type { AttemptPayload, Profile } from '@/lib/types'

export function TakeQuizClient(props: { profile: Profile; quizId: number }) {
  const { profile, quizId } = props
  const router = useRouter()
  const feedback = useFeedback()

  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [textAnswer, setTextAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase.rpc('start_attempt', {
      p_quiz_id: quizId,
    })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setAttempt(data as AttemptPayload)
    setIdx(0)
    setTextAnswer('')
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the attempt as soon as the page loads
    start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId])

  const q = attempt?.questions[idx]
  const isCompleted = !!attempt?.completed_at
  const progress = useMemo(() => {
    if (!attempt) return '0/0'
    return `${idx + 1}/${attempt.questions.length}`
  }, [attempt, idx])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset the textarea when the current question changes
    setTextAnswer(q?.answer_text ?? '')
  }, [q?.id, q?.answer_text])

  async function refresh(attemptId: number) {
    const { data, error } = await createClient().rpc('get_attempt', {
      p_attempt_id: attemptId,
    })
    if (error) throw error
    setAttempt(data as AttemptPayload)
  }
  async function saveAnswer(selectedIndex: number | null, text: string | null) {
    if (!attempt || !q) return
    const { error } = await createClient().rpc('submit_answer', {
      p_attempt_id: attempt.id,
      p_question_id: q.id,
      p_selected_index: selectedIndex,
      p_answer_text: text,
    })
    if (error) throw error
  }
  async function answer(selectedIndex: number) {
    if (!attempt || isCompleted || !q || submitting) return
    setSubmitting(true)
    await feedback(async () => {
      await saveAnswer(selectedIndex, null)
      await refresh(attempt.id)
    }, 'Answer saved.')
    setSubmitting(false)
  }
  async function submitTextAnswer() {
    if (!attempt || !q || isCompleted || submitting) return
    setSubmitting(true)
    await feedback(async () => {
      await saveAnswer(null, textAnswer)
      await refresh(attempt.id)
    }, 'Answer saved.')
    setSubmitting(false)
  }
  async function complete() {
    if (!attempt || isCompleted || submitting) return
    setSubmitting(true)
    await feedback(async () => {
      if (q && !isChoiceQuestion(q.type) && textAnswer.trim())
        await saveAnswer(null, textAnswer)
      const { data, error } = await createClient().rpc('complete_attempt', {
        p_attempt_id: attempt.id,
      })
      if (error) throw error
      setAttempt(data as AttemptPayload)
    }, 'Quiz submitted successfully.')
    setSubmitting(false)
  }

  if (loading) {
    return (
      <AppShell title="Your quiz" profile={profile}>
        <Surface>
          <p role="status" className="text-sm text-slate-500">
            Preparing your questions…
          </p>
        </Surface>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell
        title="Taking Quiz"
        profile={profile}
        actions={
          <Link href="/" className="btn ">
            Exit
          </Link>
        }
      >
        <div className="mx-auto max-w-2xl">
          <Surface>
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          </Surface>
        </div>
      </AppShell>
    )
  }

  if (!attempt) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <AppShell
      title={isCompleted ? 'Results' : 'Taking Quiz'}
      subtitle={attempt.quiz.title}
      profile={profile}
      actions={
        <>
          <Link href="/" className="btn ">
            Exit
          </Link>
          {isCompleted ? (
            <button onClick={() => start()} className="btn btn-primary ">
              Retry
            </button>
          ) : null}
        </>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {isCompleted ? (
          <Surface className="bg-emerald-50">
            <div className="text-center">
              <div className="eyebrow">Your score</div>
              <div className="mt-2 text-4xl font-semibold text-slate-900">
                {attempt.score}/{attempt.total_questions}
              </div>
              <div className="mt-2 text-sm text-slate-500">
                You have completed the quiz.
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href={`/quizzes/${quizId}/results`} className="btn ">
                  Review Attempts
                </Link>
                <button
                  onClick={() => router.push('/')}
                  className="btn btn-primary "
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </Surface>
        ) : (
          <Surface>
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-slate-600">
                Question {progress}
              </div>
              <div className="text-sm text-slate-500">
                {attempt.questions.length} total questions
              </div>
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
              {q?.prompt}
            </div>

            {q && isChoiceQuestion(q.type) ? (
              <div className="mt-6 space-y-3">
                {(q.options ?? []).map((opt, optIdx) => {
                  const selected = q.selected_index === optIdx
                  const showCorrectness = isCompleted && q.is_correct !== null
                  const isCorrectOption =
                    showCorrectness && q.is_correct && selected
                  const isWrongSelected =
                    showCorrectness && !q.is_correct && selected

                  return (
                    <button
                      key={optIdx}
                      aria-pressed={selected}
                      disabled={submitting || isCompleted}
                      onClick={() => answer(optIdx)}
                      className={[
                        'answer-option w-full rounded-md border px-4 py-4 text-left text-sm transition',
                        'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50',
                        selected ? 'border-emerald-500 bg-emerald-50' : '',
                        isCorrectOption
                          ? 'border-emerald-300 bg-emerald-50'
                          : '',
                        isWrongSelected ? 'border-red-300 bg-red-50' : '',
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
                  disabled={submitting || isCompleted}
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
                {!isCompleted ? (
                  <button
                    onClick={submitTextAnswer}
                    disabled={submitting || !textAnswer.trim()}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    Save Answer
                  </button>
                ) : null}
                {isCompleted && q ? (
                  <div
                    className={[
                      'rounded-md border px-4 py-3 text-sm',
                      q.is_correct
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-700',
                    ].join(' ')}
                  >
                    Your answer: {q.answer_text || 'No answer'}
                  </div>
                ) : null}
              </div>
            )}

            {isCompleted && q?.explanation ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">Explanation</div>
                <div className="mt-1">{q.explanation}</div>
              </div>
            ) : null}

            <div className="exam-navigation mt-6 flex items-center justify-between gap-3">
              <button
                className="btn disabled:opacity-50"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={submitting || idx === 0}
              >
                Previous
              </button>
              <div className="flex items-center gap-3">
                {!isCompleted ? (
                  <button
                    className="btn disabled:opacity-50"
                    onClick={complete}
                    disabled={submitting}
                  >
                    Finish Quiz
                  </button>
                ) : null}
                <button
                  className="btn btn-primary disabled:opacity-50"
                  onClick={() =>
                    setIdx((i) => Math.min(attempt.questions.length - 1, i + 1))
                  }
                  disabled={submitting || idx === attempt.questions.length - 1}
                >
                  Next
                </button>
              </div>
            </div>
          </Surface>
        )}
      </div>
    </AppShell>
  )
}
