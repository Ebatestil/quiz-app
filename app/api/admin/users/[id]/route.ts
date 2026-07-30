import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/requireAdminApi'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const { id } = await params
  const body = await request.json()
  const { name, email, password, is_admin } = body ?? {}

  const supabaseAdmin = createAdminClient()

  const authUpdate: Record<string, unknown> = {}
  if (typeof email === 'string') authUpdate.email = email
  if (typeof password === 'string' && password.length > 0) authUpdate.password = password
  if (typeof name === 'string') authUpdate.user_metadata = { name }

  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate)
    if (authError) return NextResponse.json({ message: authError.message }, { status: 422 })
  }

  const profileUpdate: Record<string, unknown> = {}
  if (typeof name === 'string') profileUpdate.name = name
  if (typeof email === 'string') profileUpdate.email = email
  if (typeof is_admin === 'boolean') profileUpdate.is_admin = is_admin

  if (Object.keys(profileUpdate).length > 0) {
    await supabaseAdmin.from('profiles').update(profileUpdate).eq('id', id)
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, is_admin, disabled_at, created_at')
    .eq('id', id)
    .single()

  return NextResponse.json({ data: profile })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const { id } = await params

  if (guard.userId === id) {
    return NextResponse.json({ message: 'You cannot delete yourself' }, { status: 422 })
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ message: error.message }, { status: 422 })

  return NextResponse.json({ ok: true })
}
