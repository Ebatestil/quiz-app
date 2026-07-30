'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Surface } from '@/components/AppShell'
import type { AttemptRow, Profile } from '@/lib/types'

export function ResultsClient(props: { profile: Profile; quizId: number; initialRows: AttemptRow[] }) {
  const { profile, quizId } = props
  const [rows, setRows] = useState<AttemptRow[]>(props.initialRows)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('attempts')
      .select('id, started_at, completed_at, score, total_questions')
      .eq('quiz_id', quizId)
      .eq('user_id', profile.id)
      .order('id', { ascending: false })
    setRows((data ?? []) as AttemptRow[])
    setLoading(false)
  }

  return (
    <AppShell
      title="Review Answers"
      subtitle="See your quiz history and result summaries."
      profile={profile}
      actions={
        <>
          <button
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
          <Link
            href={`/quizzes/${quizId}/take`}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            Start Again
          </Link>
        </>
      }
    >
      <div className="mx-auto max-w-5xl">
        <Surface title="Attempts">
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No attempts yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Attempt</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Completed</th>
                    <th className="px-4 py-3">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">#{r.id}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
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
