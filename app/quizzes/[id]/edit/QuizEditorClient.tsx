'use client'

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppShell, Area, Field, Surface } from '@/components/AppShell'
import { useFeedback } from '@/components/Notifications'
import { isChoiceQuestion, questionTypeLabels } from '@/lib/questions'
import type {
  ClassSection,
  Profile,
  Question,
  QuestionType,
  Quiz,
} from '@/lib/types'

const subscribeToOrigin = () => () => {}
const getOrigin = () => window.location.origin
const getServerOrigin = () => ''

export function QuizEditorClient(props: {
  profile: Profile
  initialQuiz: Quiz
  initialQuestions: Question[]
  classes: ClassSection[]
  initialClassIds: number[]
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
  const [minutes, setMinutes] = useState(
    quiz.time_limit_minutes?.toString() ?? '',
  )
  const [classIds, setClassIds] = useState<number[]>(props.initialClassIds)
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
  const feedback = useFeedback()
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function mutate(operation: () => Promise<void>, success: string) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await feedback(operation, success)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  async function saveQuiz(e: FormEvent) {
    e.preventDefault()
    await mutate(async () => {
      if (!title.trim()) throw new Error('Enter a quiz title.')
      const duration = minutes.trim() ? Number(minutes) : null
      if (
        duration !== null &&
        (!Number.isInteger(duration) || duration < 1 || duration > 480)
      )
        throw new Error(
          'Set a timer between 1 and 480 minutes, or leave it blank.',
        )
      const { data, error } = await createClient().rpc('save_quiz_settings', {
        p_quiz_id: quizId,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_published: isPublished,
        p_lockdown: lockdownEnabled,
        p_minutes: duration,
        p_classes: classIds,
      })
      if (error) throw error
      setQuiz(data as Quiz)
      router.refresh()
    }, 'Quiz saved successfully.')
  }

  async function addQuestion(e: FormEvent) {
    e.preventDefault()
    await mutate(async () => {
      if (!prompt.trim()) throw new Error('Enter a question.')
      const choice = isChoiceQuestion(questionType)
      const questionOptions =
        questionType === 'true_false' ? ['True', 'False'] : options
      if (choice && questionOptions.length < 2)
        throw new Error('Enter at least two answer options.')
      if (!choice && !answerText.trim())
        throw new Error('Enter the expected answer.')
      const { data, error } = await createClient()
        .from('questions')
        .insert({
          quiz_id: quizId,
          type: questionType,
          prompt: prompt.trim(),
          options: choice ? questionOptions : null,
          correct_index: choice
            ? Math.min(correctIndex, questionOptions.length - 1)
            : null,
          answer_text: choice ? null : answerText.trim(),
          explanation: explanation.trim() || null,
        })
        .select()
        .single()
      if (error) throw error
      setQuestions((prev) => [...prev, data as Question])
      setPrompt('')
      setExplanation('')
      setCorrectIndex(0)
      setAnswerText('')
      router.refresh()
    }, 'Question added.')
  }

  async function removeQuestion(qid: number) {
    await mutate(async () => {
      const { error } = await createClient()
        .from('questions')
        .delete()
        .eq('id', qid)
        .select('id')
        .single()
      if (error) throw error
      setQuestions((prev) => prev.filter((q) => q.id !== qid))
      router.refresh()
    }, 'Question removed.')
  }

  async function deleteQuiz() {
    if (!confirm('Delete this quiz and its attempts?')) return
    await mutate(async () => {
      const { error } = await createClient()
        .from('quizzes')
        .delete()
        .eq('id', quizId)
        .select('id')
        .single()
      if (error) throw error
      router.replace('/')
      router.refresh()
    }, 'Quiz deleted.')
  }

  const origin = useSyncExternalStore(
    subscribeToOrigin,
    getOrigin,
    getServerOrigin,
  )
  const examLink = origin ? origin + '/exam/' + quiz.share_token : ''

  async function copyExamLink() {
    await feedback(async () => {
      if (!examLink) throw new Error('The exam link is not ready yet.')
      await navigator.clipboard.writeText(examLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }, 'Exam link copied.')
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
            disabled={busy}
            className="rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <Surface
            title="01 / Quiz details"
            subtitle="The essentials your students will see."
          >
            <form onSubmit={saveQuiz}>
              <fieldset disabled={busy} className="space-y-3">
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
                      Requests fullscreen; switching tabs/apps auto-submits.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={lockdownEnabled}
                    onChange={(e) => setLockdownEnabled(e.target.checked)}
                  />
                </label>
                <Field
                  label="Time limit (minutes)"
                  type="number"
                  min={1}
                  max={480}
                  step={1}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="No time limit"
                />
                <p className="text-xs text-slate-500">
                  Leave blank for no timer. Each student gets the full duration
                  from the start of their attempt. Changes apply to new attempts
                  only.
                </p>
                <fieldset className="rounded-md border border-slate-200 p-4">
                  <legend className="px-1 text-sm font-medium">
                    Assigned classes
                  </legend>
                  <p className="mb-3 text-xs text-slate-500">
                    Only registered students in these sections can start this
                    quiz.
                  </p>
                  {props.classes.map((section) => (
                    <label
                      key={section.id}
                      className="flex items-center gap-2 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={classIds.includes(section.id)}
                        onChange={(e) =>
                          setClassIds((prev) =>
                            e.target.checked
                              ? [...prev, section.id]
                              : prev.filter((id) => id !== section.id),
                          )
                        }
                      />
                      {section.name}
                    </label>
                  ))}
                  {!props.classes.length && (
                    <p className="text-sm text-slate-500">
                      Create a class before publishing.
                    </p>
                  )}
                  <Link
                    href="/classes"
                    className="mt-2 inline-block text-sm underline"
                  >
                    Manage classes and students
                  </Link>
                </fieldset>
                <button className="btn btn-primary w-full">Save Quiz</button>
              </fieldset>
            </form>
          </Surface>

          <Surface
            title="Share with your students"
            subtitle="One link. No student accounts needed."
          >
            {quiz.is_published ? (
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
                {quiz.lockdown_enabled ? (
                  <p className="text-xs text-amber-600">
                    Exam Mode is on: fullscreen is requested, and the attempt
                    auto-submits the instant they switch tabs, switch apps, or
                    exit fullscreen.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Exam Mode is off — students can take this like a normal quiz
                    without lockdown. The timer still applies if one is set.
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
            <form onSubmit={addQuestion}>
              <fieldset disabled={busy} className="space-y-3">
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
                    onChange={(e) => {
                      setQuestionType(e.target.value as QuestionType)
                      setCorrectIndex(0)
                      setAnswerText('')
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500"
                  >
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="identification">Identification</option>
                    <option value="true_false">True or false</option>
                    <option value="enumeration">Enumeration</option>
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
                        onChange={(e) =>
                          setCorrectIndex(Number(e.target.value))
                        }
                      >
                        {options.map((option, index) => (
                          <option key={index} value={index}>
                            {index + 1}. {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : questionType === 'true_false' ? (
                  <label className="form-field">
                    <span>Correct answer</span>
                    <select
                      className="form-input"
                      value={correctIndex}
                      onChange={(e) => setCorrectIndex(Number(e.target.value))}
                    >
                      <option value={0}>True</option>
                      <option value={1}>False</option>
                    </select>
                  </label>
                ) : questionType === 'enumeration' ? (
                  <>
                    <Area
                      label="Expected answers (one per line)"
                      placeholder={'Mercury\nVenus\nEarth'}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      rows={5}
                      required
                    />
                    <p className="text-xs text-slate-500">
                      Order does not matter. All listed answers must match for
                      one point. Capitalization and extra spaces are ignored.
                    </p>
                  </>
                ) : (
                  <Field
                    label="Correct answer"
                    placeholder="Type the expected answer"
                    required
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
                <button className="btn btn-primary w-full">
                  + Add Question
                </button>
              </fieldset>
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
                        {questionTypeLabels[q.type]}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {q.prompt}
                      </div>
                      {isChoiceQuestion(q.type) ? (
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
                          Correct answer:{' '}
                          <span className="whitespace-pre-line">
                            {q.answer_text}
                          </span>
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
                      disabled={busy}
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
