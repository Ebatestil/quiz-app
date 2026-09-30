'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Surface } from '@/components/AppShell'
import type { AttemptRow, Profile } from '@/lib/types'
import { useFeedback } from '@/components/Notifications'

const TERMINATION_LABELS: Record<string, string> = {
  time_expired: 'Time expired',
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
  initialTotal: number
  initialCompleted: number
}) {
  const { profile, quizId, isOwner } = props
  const [rows, setRows] = useState<AttemptRow[]>(props.initialRows)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(props.initialTotal)
  const [completed, setCompleted] = useState(props.initialCompleted)
  const [matched, setMatched] = useState(props.initialTotal)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const pending = useRef(false)
  const pageCount = Math.max(1, Math.ceil(matched / 15))
  const [loading, setLoading] = useState(false)
  const feedback = useFeedback()

  async function load(requestedPage = page, term = activeSearch) {
    if (pending.current) return
    pending.current = true
    setLoading(true)
    await feedback(async () => {
      const supabase = createClient()
      const expired = await supabase.rpc('expire_quiz_attempts', {
        p_quiz_id: quizId,
      })
      if (expired.error) throw expired.error
      let query = supabase
        .from('attempts')
        .select(
          'id, started_at, completed_at, score, total_questions, student_name, class_name, termination_reason',
          { count: 'exact' },
        )
        .eq('quiz_id', quizId)
        .order('id', { ascending: false })

      if (!isOwner) {
        query = query.eq('user_id', profile.id)
      }

      let completedQuery = supabase
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quizId)
        .not('completed_at', 'is', null)
      if (!isOwner) completedQuery = completedQuery.eq('user_id', profile.id)
      let totalQuery = supabase
        .from('attempts')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quizId)
      if (!isOwner) totalQuery = totalQuery.eq('user_id', profile.id)
      if (term.trim()) {
        const literal = term
          .trim()
          .replace(/[\\%_]/g, (character) => '\\' + character)
        query = query.ilike('student_name', '%' + literal + '%')
      }
      const [result, completedResult, totalResult] = await Promise.all([
        query.range((requestedPage - 1) * 15, requestedPage * 15 - 1),
        completedQuery,
        totalQuery,
      ])
      if (totalResult.error) throw totalResult.error
      if (result.error) throw result.error
      if (completedResult.error) throw completedResult.error
      const nextTotal = result.count ?? 0
      const nextPage = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(nextTotal / 15)),
      )
      let nextRows = result.data
      if (nextPage !== requestedPage) {
        const corrected = await query.range(
          (nextPage - 1) * 15,
          nextPage * 15 - 1,
        )
        if (corrected.error) throw corrected.error
        nextRows = corrected.data
      }
      setRows((nextRows ?? []) as AttemptRow[])
      setMatched(nextTotal)
      setTotal(totalResult.count ?? 0)
      setActiveSearch(term.trim())
      setCompleted(completedResult.count ?? 0)
      setPage(nextPage)
    }, 'Results refreshed.')
    setLoading(false)
    pending.current = false
  }

  async function deleteAttempt(row: AttemptRow) {
    if (!isOwner || pending.current) return
    if (
      !confirm(
        'Delete attempt #' +
          row.id +
          ' for ' +
          (row.student_name || 'this user') +
          '? This permanently removes its score, answers and warnings. The student can retake if the quiz is available and no other attempt blocks them.',
      )
    )
      return
    pending.current = true
    setLoading(true)
    const removed = await feedback(async () => {
      const { error } = await createClient()
        .from('attempts')
        .delete()
        .eq('id', row.id)
        .eq('quiz_id', quizId)
        .select('id')
        .single()
      if (error) throw error
    }, 'Attempt deleted. The student can retake while the quiz is available.')
    pending.current = false
    if (removed) await load(page)
    else setLoading(false)
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
          <button onClick={() => load()} disabled={loading} className="btn ">
            Refresh
          </button>
          <Link href={`/quizzes/${quizId}/take`} className="btn btn-primary ">
            Start Again
          </Link>
        </>
      }
    >
      <div className="w-full min-w-0">
        <div className="stats-strip" aria-label="Submission overview">
          <div className="stat">
            <span>Total attempts</span>
            <strong>{total}</strong>
          </div>
          <div className="stat">
            <span>Completed</span>
            <strong>{completed}</strong>
          </div>
          <div className="stat">
            <span>In progress</span>
            <strong>{total - completed}</strong>
          </div>
        </div>
        <Surface
          title="Submission history"
          subtitle="Open an attempt to review individual answers."
        >
          {isOwner && (
            <form
              className="mb-4 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void load(1, search)
              }}
            >
              <label
                className="flex flex-1 flex-col gap-1 text-sm"
                htmlFor="student-search"
              >
                Search student name
                <input
                  id="student-search"
                  type="search"
                  className="form-input"
                  placeholder="Enter a student's name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={loading}
                />
              </label>
              <button className="btn btn-primary" disabled={loading}>
                Search
              </button>
              {(search || activeSearch) && (
                <button
                  type="button"
                  className="btn"
                  disabled={loading}
                  onClick={() => {
                    setSearch('')
                    void load(1, '')
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          )}
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              {activeSearch
                ? 'No submissions match this student name.'
                : 'No attempts yet.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full whitespace-nowrap text-left text-sm">
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
                              {r.class_name ? (
                                <div className="text-xs text-slate-400">
                                  {r.class_name}
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
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/quizzes/${quizId}/results/${r.id}`}
                            className="btn "
                          >
                            Review
                          </Link>
                          {isOwner && (
                            <button
                              className="roster-delete"
                              disabled={loading}
                              onClick={() => void deleteAttempt(r)}
                              aria-label={'Delete attempt ' + r.id}
                            >
                              Delete attempt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matched > 0 && (
            <nav
              aria-label="Submission history pages"
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-slate-500" aria-live="polite">
                Showing {(page - 1) * 15 + 1}–{Math.min(page * 15, matched)} of{' '}
                {matched}{' '}
                {activeSearch ? 'matching submissions' : 'submissions'}
              </p>
              <div className="flex items-center gap-3">
                <button
                  className="btn"
                  disabled={loading || page === 1}
                  onClick={() => load(page - 1)}
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  className="btn"
                  disabled={loading || page >= pageCount}
                  onClick={() => load(page + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </Surface>
      </div>
    </AppShell>
  )
}
