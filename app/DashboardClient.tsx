'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Area, Field, Surface, Icon } from '@/components/AppShell'
import type { Profile, Quiz } from '@/lib/types'

export function DashboardClient(props: {
  profile: Profile
  initialQuizzes: Quiz[]
}) {
  const { profile } = props
  const router = useRouter()
  const [quizzes, setQuizzes] = useState<Quiz[]>(props.initialQuizzes)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await createClient()
      .from('quizzes')
      .select('*, questions(count)')
      .eq('user_id', profile.id)
      .order('id', { ascending: false })
    if (loadError) setError(loadError.message)
    else
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
    if (!title.trim() || creating) return
    setCreating(true)
    setError(null)
    const { error: createError } = await createClient()
      .from('quizzes')
      .insert({
        user_id: profile.id,
        title: title.trim(),
        description: description.trim() || null,
      })
    if (createError) {
      setError(createError.message)
      setCreating(false)
      return
    }
    setTitle('')
    setDescription('')
    setShowCreate(false)
    setSearch('')
    setFilter('all')
    await load()
    setCreating(false)
    router.refresh()
  }

  const publishedCount = quizzes.filter((q) => q.is_published).length
  const totalQuestions = quizzes.reduce(
    (sum, q) => sum + (q.questions_count ?? 0),
    0,
  )
  const visibleQuizzes = quizzes.filter(
    (q) =>
      (filter === 'all' ||
        (filter === 'published' ? q.is_published : !q.is_published)) &&
      `${q.title} ${q.description ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )

  return (
    <AppShell
      title="My quizzes"
      subtitle="Your questions, ready for the next lesson."
      profile={profile}
      actions={
        <>
          <button onClick={load} disabled={loading} className="btn btn-quiet">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
            aria-controls="create-quiz"
          >
            <Icon name="plus" />
            New quiz
          </button>
        </>
      }
    >
      <div className="stats-strip" aria-label="Quiz overview">
        <div className="stat">
          <span>Total quizzes</span>
          <strong>{quizzes.length.toString().padStart(2, '0')}</strong>
        </div>
        <div className="stat">
          <span>Published</span>
          <strong>{publishedCount.toString().padStart(2, '0')}</strong>
        </div>
        <div className="stat">
          <span>Questions written</span>
          <strong>{totalQuestions.toString().padStart(2, '0')}</strong>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {showCreate && (
        <div id="create-quiz" className="create-panel">
          <Surface
            title="A new quiz"
            subtitle="Start with a title. You can add your questions next."
          >
            <form onSubmit={createQuiz}>
              <Field
                label="Quiz title"
                placeholder="e.g. Introduction to biology"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
              <Area
                label="Description (optional)"
                placeholder="What will this quiz cover?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              <div className="create-panel-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create quiz'}
                  <Icon name="arrow" />
                </button>
              </div>
            </form>
          </Surface>
        </div>
      )}
      <div className="library-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter quizzes">
          {(['all', 'published', 'draft'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all'
                ? 'All quizzes'
                : value === 'published'
                  ? 'Published'
                  : 'Drafts'}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search quizzes"
            placeholder="Search quizzes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <section
        className="quiz-list"
        aria-label="Quiz collection"
        aria-busy={loading}
      >
        <div className="quiz-list-heading">
          <span>Quiz collection</span>
          <span>
            {visibleQuizzes.length}{' '}
            {visibleQuizzes.length === 1 ? 'quiz' : 'quizzes'}
          </span>
        </div>
        {visibleQuizzes.length === 0 ? (
          <div className="empty-state">
            <Icon name="book" />
            <h2>
              {quizzes.length
                ? 'No matching quizzes'
                : 'Start with a question.'}
            </h2>
            <p>
              {quizzes.length
                ? 'Try another search or choose a different filter.'
                : 'Create your first quiz, then make it your own.'}
            </p>
            {!quizzes.length && (
              <button
                className="btn btn-primary mt-5"
                onClick={() => setShowCreate(true)}
              >
                <Icon name="plus" />
                Create a quiz
              </button>
            )}
          </div>
        ) : (
          visibleQuizzes.map((q) => (
            <article key={q.id} className="quiz-row">
              <div className="quiz-symbol">
                <Icon name="book" />
              </div>
              <div className="quiz-info">
                <h2>
                  <Link href={`/quizzes/${q.id}/edit`}>{q.title}</Link>
                </h2>
                {q.description && <p>{q.description}</p>}
                <div className="quiz-meta">
                  <span
                    className={`status ${q.is_published ? 'status-published' : ''}`}
                  >
                    {q.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span>{q.questions_count ?? 0} questions</span>
                </div>
              </div>
              <div className="row-actions">
                <Link
                  className="btn btn-quiet"
                  href={`/quizzes/${q.id}/results`}
                >
                  Results
                </Link>
                <Link className="btn btn-quiet" href={`/quizzes/${q.id}/take`}>
                  Start
                </Link>
                <Link className="btn" href={`/quizzes/${q.id}/edit`}>
                  Edit quiz
                  <Icon name="arrow" />
                </Link>
              </div>
            </article>
          ))
        )}
      </section>
    </AppShell>
  )
}
