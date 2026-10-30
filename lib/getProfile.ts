import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types'

// Legacy teacher pages are retired in this demo repository.
export async function requireProfile(): Promise<Profile> {
  redirect('/demo')
}
export async function requireAdminProfile(): Promise<Profile> {
  redirect('/demo')
}
