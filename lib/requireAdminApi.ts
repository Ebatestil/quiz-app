import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireAdminApi() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ message: 'Unauthenticated' }, { status: 401 }) }
  }

  if (user.is_anonymous) {
    return { error: NextResponse.json({ message: 'A workspace account is required.' }, { status: 403 }) }
  }

  const { data: profile } = await supabase.from('profiles').select('is_admin, is_anonymous, disabled_at').eq('id', user.id).single()

  if (!profile?.is_admin || profile.is_anonymous || profile.disabled_at) {
    return { error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }) }
  }

  return { userId: user.id }
}
