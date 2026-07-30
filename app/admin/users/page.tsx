import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminProfile } from '@/lib/getProfile'
import { AdminUsersClient } from './AdminUsersClient'
import type { Profile } from '@/lib/types'

export default async function AdminUsersPage() {
  const profile = await requireAdminProfile()
  // profiles RLS only allows selecting your own row, so listing every user
  // for the admin panel goes through the service-role client (server-only).
  const supabaseAdmin = createAdminClient()

  const { data: users } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, is_admin, disabled_at, created_at')
    .order('created_at', { ascending: false })

  return <AdminUsersClient profile={profile} initialUsers={(users ?? []) as Profile[]} />
}
