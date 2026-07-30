import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/requireAdminApi'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminApi()
  if ('error' in guard) return guard.error

  const { id } = await params
  const supabaseAdmin = createAdminClient()

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .update({ disabled_at: null })
    .eq('id', id)
    .select('id, disabled_at')
    .single()

  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  return NextResponse.json({ data: profile })
}
