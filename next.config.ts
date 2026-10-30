import type { NextConfig } from 'next'

// Require explicit demo configuration instead of silently reusing teacher keys.
if (
  process.env.NODE_ENV === 'production' &&
  [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].some(Boolean)
) {
  throw new Error(
    'Remove the legacy Supabase variables. Configure DEMO_SUPABASE_URL and DEMO_SUPABASE_SERVICE_ROLE_KEY for the demo database instead.',
  )
}

const nextConfig: NextConfig = {/* config options here */}

export default nextConfig
