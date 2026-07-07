import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Server-only Supabase clients for API routes. Two explicit variants — the
// difference is security-relevant, so they are NOT merged:
//
//  • createAdminClient()        — service-role key ONLY (bypasses RLS). Returns
//                                 null if the service key isn't configured.
//  • createServiceOrAnonClient()— service-role key, falling back to the public
//                                 anon key (which is subject to RLS) so reads
//                                 still work if the service key is absent.
//
// Never import these into client components — they must run server-side only.

const AUTH_OPTS = { auth: { autoRefreshToken: false, persistSession: false } }

// Service-role only. Use for routes that must write past RLS AND already enforce
// their own authorization (portal/*, admin/users, etc.).
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, AUTH_OPTS)
}

// Service-role preferred, anon-key fallback. Use for routes where reads should
// keep working even without the service key (lineage, nedarim). Falls back to a
// client bound by RLS rather than failing outright.
export function createServiceOrAnonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, AUTH_OPTS)
}
