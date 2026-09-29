import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { QuizEditorClient } from './QuizEditorClient'
import type { Question, Quiz } from '@/lib/types'

export default async function QuizEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const quizId = Number(id)
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('*')
    .eq('id', quizId)
    .eq('user_id', profile.id)
    .single()

  if (!quiz) notFound()

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', quizId)
    .order('id', { ascending: true })

  const [classResult, assignmentResult] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name')
      .eq('user_id', profile.id)
      .order('name'),
    supabase.from('quiz_classes').select('class_id').eq('quiz_id', quizId),
  ])
  if (classResult.error) throw classResult.error
  if (assignmentResult.error) throw assignmentResult.error
  return (
    <QuizEditorClient
      profile={profile}
      classes={classResult.data ?? []}
      initialClassIds={(assignmentResult.data ?? []).map((row) => row.class_id)}
      initialQuiz={quiz as Quiz}
      initialQuestions={(questions ?? []) as Question[]}
    />
  )
}
