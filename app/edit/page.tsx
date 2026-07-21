import { redirect } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { loadPublicTexts } from '@/lib/publicTextsStore'
import type { Profile } from '@/types'
import PublicTextsEditor from './PublicTextsEditor'

// ─────────────────────────────────────────────────────────────────────────────
// /edit — עריכת נוסחי הממשק הציבורי.
//
// דף לא מקושר (אין אליו קישור מהתפריט), אך ⚠️ "לא מקושר" איננו אבטחה:
// כתובת נוחה לזכירה היא כתובת נוחה לניחוש. לכן הבדיקה כאן היא בשרת,
// לפני שמשהו מוצג, ובנוסף ה-API עצמו אוכף הרשאה בכל שמירה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const metadata = { title: 'עריכת נוסחים — ממשק ציבורי' }

export default async function EditPage() {
  if (!isSupabaseConfigured()) redirect('/login')

  let profile: Profile | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login?next=/edit')
    const { data } = await supabase
      .from('profiles').select('id, full_name, email, role, permissions')
      .eq('id', user.id).single()
    profile = data as Profile | null
  } catch {
    redirect('/login')
  }

  // מנהל בלבד — לא מזכירות. אותה הבחנה כמו AdminOnly, אך נאכפת בשרת.
  if (profile?.role !== 'admin') redirect('/admin/dashboard')

  const texts = await loadPublicTexts()

  return <PublicTextsEditor initialTexts={texts} />
}
