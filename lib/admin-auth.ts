import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// אימות שהמשתמש מחובר ומשמש כמנהל. משותף לכל מסלולי תיבת הדואר.
export async function getAuthedAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* server component */ } },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { ok: false as const }
  return { ok: true as const, supabase, user }
}
