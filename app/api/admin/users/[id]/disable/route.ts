import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/requireAdminApi'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const { id } = await params

  if (guard.userId === id) {
    return NextResponse.json({ message: 'You cannot disable yourself' }, { status: 422 })
  }

  const supabaseAdmin = createAdminClient()

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .update({ disabled_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, disabled_at')
    .single()

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  // The middleware checks disabled_at on every request and signs the user out
  // as soon as it sees it, so access is cut off on their very next request.
  return NextResponse.json({ data: profile })
}
