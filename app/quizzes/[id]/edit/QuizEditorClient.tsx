'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Area, Field, Surface } from '@/components/AppShell'
import type { Profile, Question, QuestionType, Quiz } from '@/lib/types'

const subscribeToOrigin = () => () => {}
const getOrigin = () => window.location.origin
const getServerOrigin = () => ''

export function QuizEditorClient(props: {
  profile: Profile
  initialQuiz: Quiz
  initialQuestions: Question[]
}) {
  const { profile } = props
  const router = useRouter()
  const quizId = props.initialQuiz.id

  const [quiz, setQuiz] = useState<Quiz>(props.initialQuiz)
  const [questions, setQuestions] = useState<Question[]>(props.initialQuestions)

  const [title, setTitle] = useState(quiz.title)
  const [description, setDescription] = useState(quiz.description ?? '')
  const [isPublished, setIsPublished] = useState(quiz.is_published)
  const [lockdownEnabled, setLockdownEnabled] = useState(quiz.lockdown_enabled)
  const [copied, setCopied] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [questionType, setQuestionType] =
    useState<QuestionType>('multiple_choice')
  const [optionsText, setOptionsText] = useState(
    'Option A\nOption B\nOption C\nOption D',
  )
  const options = useMemo(
    () =>
      optionsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [optionsText],
  )
  const [correctIndex, setCorrectIndex] = useState(0)
  const [answerText, setAnswerText] = useState('')
  const [explanation, setExplanation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function saveQuiz(e: FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('quizzes')
      .update({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        is_published: isPublished,
        lockdown_enabled: lockdownEnabled,
      })
      .eq('id', quizId)
      .select()
      .single()

    if (err) {
      setError(err.message)
      return
    }
    setQuiz(data as Quiz)
    router.refresh()
  }

  async function addQuestion(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('questions')
      .insert({
        quiz_id: quizId,
        type: questionType,
        prompt: prompt.trim(),
        options: questionType === 'multiple_choice' ? options : null,
        correct_index:
          questionType === 'multiple_choice'
            ? Math.min(correctIndex, Math.max(0, options.length - 1))
            : null,
        answer_text:
          questionType === 'identification' ? answerText.trim() : null,
        explanation: explanation.trim() ? explanation.trim() : null,
      })
      .select()
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setQuestions((prev) => [...prev, data as Question])
    setPrompt('')
    setExplanation('')
    setCorrectIndex(0)
    setAnswerText('')
    setQuestionType('multiple_choice')
  }

  async function removeQuestion(qid: number) {
    const supabase = createClient()
    await supabase.from('questions').delete().eq('id', qid)
    setQuestions((prev) => prev.filter((q) => q.id !== qid))
  }

  async function deleteQuiz() {
    if (!confirm('Delete this quiz?')) return
    const supabase = createClient()
    await supabase.from('quizzes').delete().eq('id', quizId)
    router.replace('/')
    router.refresh()
  }

  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOrigin,
    getServerOrigin,
  )
  const examLink = origin ? `${origin}/exam/${quiz.share_token}` : ''

  async function copyExamLink() {
    if (!examLink) return
    await navigator.clipboard.writeText(examLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AppShell
      title={quiz.title}
      subtitle="Quiz editor · Make every question count."
      profile={profile}
      actions={
        <>
          <Link href="/" className="btn ">
            Back
          </Link>
          <Link href={`/quizzes/${quizId}/take`} className="btn btn-primary ">
            Start Quiz
          </Link>
          <button
            onClick={deleteQuiz}
            className="rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </>
      }
    >
      {error ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Surface
            title="01 / Quiz details"
            subtitle="The essentials your students will see."
          >
            <form onSubmit={saveQuiz} className="space-y-3">
              <Field
                label="Quiz title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Area
                label="Description"
                className="min-h-24"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">
                  Published
                </span>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">
                    Exam Mode (lockdown)
                  </div>
                  <div className="text-xs text-slate-500">
                    Fullscreen required; switching tabs/apps auto-submits.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={lockdownEnabled}
                  onChange={(e) => setLockdownEnabled(e.target.checked)}
                />
              </label>
              <button className="btn btn-primary w-full">Save Quiz</button>
            </form>
          </Surface>

          <Surface
            title="Share with your students"
            subtitle="One link. No student accounts needed."
          >
            {isPublished ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                  <code className="flex-1 truncate text-sm text-slate-700">
                    {examLink}
                  </code>
                  <button
                    onClick={copyExamLink}
                    className="btn btn-primary shrink-0"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {lockdownEnabled ? (
                  <p className="text-xs text-amber-600">
                    Exam Mode is on: students must allow fullscreen, and the
                    attempt auto-submits the instant they switch tabs, switch
                    apps, or exit fullscreen.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Exam Mode is off — students can take this like a normal
                    untimed quiz, no lockdown.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Publish this quiz to activate its exam link.
              </div>
            )}
          </Surface>

          <Surface
            title="02 / Write a question"
            subtitle="Choose a format, then add your answer and explanation."
          >
            <form onSubmit={addQuestion} className="space-y-3">
              <Area
                label="Question"
                className="min-h-24"
                placeholder="What is JavaScript?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-slate-700">
                  Question type
                </span>
                <select
                  value={questionType}
                  onChange={(e) =>
                    setQuestionType(e.target.value as QuestionType)
                  }
                  className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                >
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="identification">Identification</option>
                </select>
              </label>
              {questionType === 'multiple_choice' ? (
                <>
                  <Area
                    label="Answer options"
                    className="min-h-28"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                  />
                  <label className="form-field">
                    <span>Correct answer</span>
                    <select
                      className="form-input"
                      value={Math.min(
                        correctIndex,
                        Math.max(0, options.length - 1),
                      )}
                      onChange={(e) => setCorrectIndex(Number(e.target.value))}
                    >
                      {options.map((option, index) => (
                        <option key={index} value={index}>
                          {index + 1}. {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <Field
                  label="Correct answer"
                  placeholder="Type the expected answer"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                />
              )}
              <Area
                label="Explanation"
                className="min-h-20"
                placeholder="Optional feedback after scoring"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
              <button className="btn btn-primary w-full">+ Add Question</button>
            </form>
          </Surface>
        </div>

        <Surface
          title="Question collection"
          subtitle={`${questions.length} question${questions.length === 1 ? '' : 's'} in this quiz`}
        >
          {questions.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No questions yet.
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q, index) => (
                <div
                  key={q.id}
                  className="rounded-md border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-600">
                        Question {index + 1}
                      </div>
                      <div className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {q.type === 'multiple_choice'
                          ? 'Multiple choice'
                          : 'Identification'}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {q.prompt}
                      </div>
                      {q.type === 'multiple_choice' ? (
                        <div className="mt-3 space-y-2">
                          {(q.options ?? []).map((opt, idx) => (
                            <div
                              key={idx}
                              className={[
                                'rounded-md border px-3 py-2 text-sm',
                                idx === q.correct_index
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-600',
                              ].join(' ')}
                            >
                              {idx + 1}. {opt}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          Correct answer: {q.answer_text}
                        </div>
                      )}
                      {q.explanation ? (
                        <p className="mt-3 text-sm text-slate-500">
                          {q.explanation}
                        </p>
                      ) : null}
                    </div>
                    <button
                      onClick={() => removeQuestion(q.id)}
                      className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
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
