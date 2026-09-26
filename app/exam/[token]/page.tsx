import { createClient } from '@/lib/supabase/server'
import { ExamClient } from './ExamClient'

export default async function ExamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, title, description, is_published, lockdown_enabled')
    .eq('share_token', token)
    .single()

  return <ExamClient token={token} quiz={quiz} />
}
