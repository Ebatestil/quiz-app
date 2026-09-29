import { isChoiceQuestion, questionTypeLabels } from '@/lib/questions'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { AppShell, Surface } from '@/components/AppShell'
import type { AttemptPayload } from '@/lib/types'

const TERMINATION_LABELS: Record<string, string> = {
  time_expired: 'Time expired',
  tab_switch: 'Auto-submitted: student switched tabs or apps',
  blur: 'Auto-submitted: student left the exam window',
  fullscreen_exit: 'Auto-submitted: student exited fullscreen',
  devtools: 'Auto-submitted: student attempted to open developer tools',
}

export default async function AttemptReviewPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>
}) {
  const { id, attemptId } = await params
  const quizId = Number(id)
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_attempt', {
    p_attempt_id: Number(attemptId),
  })
  if (error || !data) notFound()

  const attempt = data as AttemptPayload
  const isComplete = !!attempt.completed_at

  return (
    <AppShell
      title={
        attempt.student_name
          ? `${attempt.student_name}'s Attempt`
          : 'Your Attempt'
      }
      subtitle={attempt.quiz.title}
      profile={profile}
      actions={
        <Link href={`/quizzes/${quizId}/results`} className="btn ">
          Back to Results
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {attempt.student_name ? (
                <div className="text-sm text-slate-500">
                  {attempt.student_name}
                  {attempt.class_name ? ` · ${attempt.class_name}` : ''}
                </div>
              ) : null}
              <div className="mt-1 text-3xl font-semibold text-slate-900">
                {attempt.score ?? '—'}/{attempt.total_questions ?? '—'}
              </div>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div>Started {new Date(attempt.started_at).toLocaleString()}</div>
              <div>
                {isComplete
                  ? `Completed ${new Date(attempt.completed_at!).toLocaleString()}`
                  : 'In progress'}
              </div>
            </div>
          </div>

          {attempt.termination_reason ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {TERMINATION_LABELS[attempt.termination_reason] ??
                `Auto-submitted: ${attempt.termination_reason}`}
            </div>
          ) : null}
        </Surface>

        <div className="space-y-4">
          {attempt.questions.map((q, index) => (
            <Surface key={q.id}>
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-600">
                Question {index + 1}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {questionTypeLabels[q.type]}
              </p>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {q.prompt}
              </div>

              {isChoiceQuestion(q.type) ? (
                <div className="mt-3 space-y-2">
                  {(q.options ?? []).map((opt, optIdx) => {
                    const wasSelected = q.selected_index === optIdx
                    return (
                      <div
                        key={optIdx}
                        className={[
                          'rounded-md border px-3 py-2 text-sm',
                          wasSelected && q.is_correct
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : wasSelected && !q.is_correct
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-slate-200 bg-white text-slate-600',
                        ].join(' ')}
                      >
                        {opt}
                        {wasSelected ? ' — selected' : ''}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div
                  className={[
                    'mt-3 whitespace-pre-line rounded-md border px-3 py-2 text-sm',
                    q.is_correct
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-red-300 bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  Answer: {q.answer_text || 'No answer'}
                </div>
              )}

              {q.explanation ? (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">
                    Explanation:{' '}
                  </span>
                  {q.explanation}
                </div>
              ) : null}
            </Surface>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
