'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Surface } from '@/components/AppShell'
import type { AttemptRow, Profile } from '@/lib/types'
import { useFeedback } from '@/components/Notifications'

const TERMINATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab/app switch',
  blur: 'Left window',
  fullscreen_exit: 'Exited fullscreen',
  devtools: 'Dev tools attempt',
}

export function ResultsClient(props: {
  profile: Profile
  quizId: number
  isOwner: boolean
  initialRows: AttemptRow[]
}) {
  const { profile, quizId, isOwner } = props
  const [rows, setRows] = useState<AttemptRow[]>(props.initialRows)
  const [loading, setLoading] = useState(false)
  const feedback = useFeedback()

  async function load() {
    setLoading(true)
    await feedback(async () => {
      const supabase = createClient()
      let query = supabase
        .from('attempts')
        .select(
          'id, started_at, completed_at, score, total_questions, student_name, student_number, termination_reason',
        )
        .eq('quiz_id', quizId)
        .order('id', { ascending: false })

      if (!isOwner) {
        query = query.eq('user_id', profile.id)
      }

      const { data, error } = await query
      if (error) throw error
      setRows((data ?? []) as AttemptRow[])
    }, 'Results refreshed.')
    setLoading(false)
  }

  return (
    <AppShell
      title={isOwner ? 'Exam results' : 'Your attempts'}
      subtitle={
        isOwner
          ? 'Every attempt on this quiz, including exam submissions from students.'
          : 'See your quiz history and result summaries.'
      }
      profile={profile}
      actions={
        <>
          <button onClick={load} disabled={loading} className="btn ">
            Refresh
          </button>
          <Link href={`/quizzes/${quizId}/take`} className="btn btn-primary ">
            Start Again
          </Link>
        </>
      }
    >
      <div className="mx-auto max-w-6xl">
        <div className="stats-strip" aria-label="Submission overview">
          <div className="stat">
            <span>Total attempts</span>
            <strong>{rows.length}</strong>
          </div>
          <div className="stat">
            <span>Completed</span>
            <strong>{rows.filter((row) => row.completed_at).length}</strong>
          </div>
          <div className="stat">
            <span>In progress</span>
            <strong>{rows.filter((row) => !row.completed_at).length}</strong>
          </div>
        </div>
        <Surface
          title="Submission history"
          subtitle="Open an attempt to review individual answers."
        >
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No attempts yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Attempt</th>
                    {isOwner ? <th className="px-4 py-3">Student</th> : null}
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        #{r.id}
                      </td>
                      {isOwner ? (
                        <td className="px-4 py-3 text-slate-600">
                          {r.student_name ? (
                            <>
                              <div className="font-medium text-slate-900">
                                {r.student_name}
                              </div>
                              {r.student_number ? (
                                <div className="text-xs text-slate-400">
                                  {r.student_number}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-slate-400">You</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.completed_at
                          ? new Date(r.completed_at).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {r.score !== null && r.total_questions !== null ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            {r.score}/{r.total_questions}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.termination_reason ? (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                            {TERMINATION_LABELS[r.termination_reason] ??
                              r.termination_reason}
                          </span>
                        ) : r.completed_at ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            Completed
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                            In progress
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/quizzes/${quizId}/results/${r.id}`}
                          className="btn "
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </div>
    </AppShell>
  )
}
