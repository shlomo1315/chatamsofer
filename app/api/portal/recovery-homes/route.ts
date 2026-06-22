import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// רשימת בתי החלמה לפורטל הציבורי (טבלת recovery_homes היא staff-only ב-RLS,
// לכן נחשפת לפורטל דרך service-role, מסוננת לפי זמינות).
const DEFAULT = ['אם וילד', 'טלזסטון', 'ביכורים']

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ regular: DEFAULT, silent: DEFAULT })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin.from('recovery_homes').select('*').order('name')
  const rows = (data ?? []) as { name?: string; availability?: string }[]
  const regular = new Set<string>(DEFAULT)
  // ללידה שקטה — כל בתי ההחלמה זמינים: הרגילים (לכלל היולדות) + המסומנים "רק לידה שקטה"
  const silent = new Set<string>(DEFAULT)
  for (const r of rows) {
    if (!r.name) continue
    const a = r.availability ?? 'regular'
    // רגיל: מציג 'regular' (לכלל היולדות) ו-'both'; לא מציג בתי החלמה ל"לידה שקטה בלבד"
    if (a === 'regular' || a === 'both') regular.add(r.name)
    // לידה שקטה: מציג את כל בתי ההחלמה
    silent.add(r.name)
  }
  return NextResponse.json({ regular: [...regular], silent: [...silent] }, { headers: { 'Cache-Control': 'no-store' } })
}
