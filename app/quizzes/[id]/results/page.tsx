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

  const { data: quiz } = await supabase.from('quizzes').select('id, title').eq('id', quizId).single()
  if (!quiz) notFound()

  const { data: rows } = await supabase
    .from('attempts')
    .select('id, started_at, completed_at, score, total_questions')
    .eq('quiz_id', quizId)
    .eq('user_id', profile.id)
    .order('id', { ascending: false })

  return <ResultsClient profile={profile} quizId={quizId} initialRows={(rows ?? []) as AttemptRow[]} />
}
