'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Area, Field, Surface } from '@/components/AppShell'
import type { Profile, Quiz } from '@/lib/types'

export function DashboardClient(props: { profile: Profile; initialQuizzes: Quiz[] }) {
  const { profile } = props
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>(props.initialQuizzes)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('quizzes')
      .select('*, questions(count)')
      .eq('user_id', profile.id)
      .order('id', { ascending: false })

    setQuizzes(
      (data ?? []).map((q: Quiz & { questions?: { count: number }[] }) => ({
        ...q,
        questions_count: q.questions?.[0]?.count ?? 0,
      })),
    )
    setLoading(false)
  }

  async function createQuiz(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const supabase = createClient()
    await supabase.from('quizzes').insert({
      user_id: profile.id,
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
    })
    setTitle('')
    setDescription('')
    await load()
    router.refresh()
  }

  const publishedCount = quizzes.filter((q) => q.is_published).length
  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questions_count ?? 0), 0)

  return (
    <AppShell
      title="Dashboard"
      subtitle={`Welcome back, ${profile.name || 'User'}!`}
      profile={profile}
      actions={
        <>
          {profile.is_admin ? (
            <Link
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/admin/users"
            >
              Manage Users
            </Link>
          ) : null}
          <button
            onClick={load}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
          >
            Refresh
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[0.95fr_2.05fr]">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Surface className="p-4">
              <div className="text-2xl font-semibold text-slate-900">{quizzes.length}</div>
              <div className="mt-1 text-sm text-slate-500">Total quizzes</div>
            </Surface>
            <Surface className="p-4">
              <div className="text-2xl font-semibold text-slate-900">{totalQuestions}</div>
              <div className="mt-1 text-sm text-slate-500">Questions</div>
            </Surface>
            <Surface className="p-4">
              <div className="text-2xl font-semibold text-emerald-600">{publishedCount}</div>
              <div className="mt-1 text-sm text-slate-500">Published</div>
            </Surface>
          </div>

          <Surface title="Create Quiz" subtitle="Add a new quiz and start building questions.">
            <form onSubmit={createQuiz} className="space-y-3">
              <Field
                label="Quiz title"
                placeholder="JavaScript Basics"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Area
                label="Description"
                className="min-h-24"
                placeholder="Beginner friendly JavaScript quiz"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500">
                + Create Quiz
              </button>
            </form>
          </Surface>
        </div>

        <Surface title="My Quizzes" subtitle="Manage, start, and review your quiz collection.">
          {loading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : quizzes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No quizzes yet.
            </div>
          ) : (
            <div className="space-y-3">
              {quizzes.map((q) => (
                <div
                  key={q.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-violet-200 hover:bg-violet-50/40"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{q.title}</h3>
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {q.questions_count ?? 0} questions
                        </span>
                        <span
                          className={[
                            'rounded-full px-2.5 py-1 text-xs font-medium',
                            q.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                          ].join(' ')}
                        >
                          {q.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{q.description || 'No description yet.'}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/quizzes/${q.id}/edit`}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/quizzes/${q.id}/take`}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                      >
                        Start
                      </Link>
                      <Link
                        href={`/quizzes/${q.id}/results`}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Results
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </AppShell>
  )
}
