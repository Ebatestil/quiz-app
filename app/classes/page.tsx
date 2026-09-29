import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/getProfile'
import { ClassesClient } from './ClassesClient'

export default async function ClassesPage() {
  const profile = await requireProfile()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('user_id', profile.id)
    .order('name')
  if (error) throw error
  return <ClassesClient profile={profile} initialClasses={data ?? []} />
}
