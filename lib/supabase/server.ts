import type { SupabaseClient } from '@supabase/supabase-js'

// Keep legacy imports fail-closed. Shared demo storage uses lib/demo/backend.ts.
export async function createClient(): Promise<SupabaseClient> {
  throw new Error('Database access is disabled in the portfolio demo.')
}
export function createAdminClient(): SupabaseClient {
  throw new Error('Admin access is disabled in the portfolio demo.')
}
