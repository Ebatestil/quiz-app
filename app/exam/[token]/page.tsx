import { createClient } from '@/lib/supabase/server'
import { ExamClient } from './ExamClient'

export default async function ExamPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select(
      'id, title, description, is_published, lockdown_enabled, time_limit_minutes, available_on',
    )
    .eq('share_token', token)
    .single()

  const { data: classes, error } = quiz
    ? await supabase.rpc('exam_classes', { p_share_token: token })
    : { data: [], error: null }
  if (error) throw error
  return (
    <ExamClient key={token} token={token} quiz={quiz} classes={classes ?? []} />
  )
}
