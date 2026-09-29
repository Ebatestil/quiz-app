import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { ResultsClient } from './ResultsClient'
import type { AttemptRow } from '@/lib/types'

export default async function ResultsPage({
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
    .select('id, title, user_id')
    .eq('id', quizId)
    .single()
  if (!quiz) notFound()

  const isOwner = quiz.user_id === profile.id
  const expired = await supabase.rpc('expire_quiz_attempts', {
    p_quiz_id: quizId,
  })
  if (expired.error) throw expired.error

  // Owners (teachers) see every attempt on their quiz, including students who
  // took it via the exam link. Everyone else only sees their own attempts.
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
  const [result, completedResult] = await Promise.all([
    query.range(0, 14),
    completedQuery,
  ])
  if (result.error) throw result.error
  if (completedResult.error) throw completedResult.error
  const rows = result.data

  return (
    <ResultsClient
      key={quizId}
      profile={profile}
      quizId={quizId}
      isOwner={isOwner}
      initialRows={(rows ?? []) as AttemptRow[]}
      initialTotal={result.count ?? 0}
      initialCompleted={completedResult.count ?? 0}
    />
  )
}
