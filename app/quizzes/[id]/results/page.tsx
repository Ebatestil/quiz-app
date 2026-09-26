import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { ResultsClient } from './ResultsClient'
import type { AttemptRow } from '@/lib/types'

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quizId = Number(id)
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: quiz } = await supabase.from('quizzes').select('id, title, user_id').eq('id', quizId).single()
  if (!quiz) notFound()

  const isOwner = quiz.user_id === profile.id

  // Owners (teachers) see every attempt on their quiz, including students who
  // took it via the exam link. Everyone else only sees their own attempts.
  let query = supabase
    .from('attempts')
    .select('id, started_at, completed_at, score, total_questions, student_name, student_number, termination_reason')
    .eq('quiz_id', quizId)
    .order('id', { ascending: false })

  if (!isOwner) {
    query = query.eq('user_id', profile.id)
  }

  const { data: rows } = await query

  return (
    <ResultsClient
      profile={profile}
      quizId={quizId}
      isOwner={isOwner}
      initialRows={(rows ?? []) as AttemptRow[]}
    />
  )
}
