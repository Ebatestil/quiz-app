import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { TakeQuizClient } from './TakeQuizClient'

export default async function TakeQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quizId = Number(id)
  const profile = await requireProfile()
  const supabase = await createClient()

  // RLS allows this select if the quiz is published OR owned by this user.
  const { data: quiz } = await supabase.from('quizzes').select('id, title').eq('id', quizId).single()

  if (!quiz) notFound()

  return <TakeQuizClient profile={profile} quizId={quizId} />
}
