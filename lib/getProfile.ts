import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'

/**
 * Server-side helper for page.tsx files: returns the current user's profile
 * or redirects to /login. Middleware already guards these routes, so this
 * mainly exists to fetch the profile data the AppShell needs to render.
 */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.is_anonymous) {
    redirect('/login')
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  if (!profile || profile.is_anonymous || profile.disabled_at) {
    redirect('/login')
  }

  return profile as Profile
}

export async function requireAdminProfile(): Promise<Profile> {
  const profile = await requireProfile()
  if (!profile.is_admin) {
    redirect('/')
  }
  return profile
}
