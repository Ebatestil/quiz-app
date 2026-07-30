import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/requireAdminApi'

export async function GET() {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, is_admin, disabled_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const body = await request.json()
  const { name, email, password, is_admin } = body ?? {}

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ message: 'name is required' }, { status: 422 })
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ message: 'email is required' }, { status: 422 })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return NextResponse.json({ message: 'password must be at least 6 characters' }, { status: 422 })
  }

  const supabaseAdmin = createAdminClient()

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (createError || !created.user) {
    return NextResponse.json({ message: createError?.message ?? 'Could not create user' }, { status: 422 })
  }

  if (is_admin) {
    await supabaseAdmin.from('profiles').update({ is_admin: true }).eq('id', created.user.id)
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, is_admin, disabled_at, created_at')
    .eq('id', created.user.id)
    .single()

  return NextResponse.json({ data: profile }, { status: 201 })
}
