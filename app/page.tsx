import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { DashboardClient } from './DashboardClient'
import type { Quiz } from '@/lib/types'

export default async function DashboardPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('quizzes')
    .select('*, questions(count)')
    .eq('user_id', profile.id)
    .order('id', { ascending: false })

  const quizzes: Quiz[] = (data ?? []).map((q: Quiz & { questions?: { count: number }[] }) => ({
    ...q,
    questions_count: q.questions?.[0]?.count ?? 0,
  }))

  return <DashboardClient profile={profile} initialQuizzes={quizzes} />
}
