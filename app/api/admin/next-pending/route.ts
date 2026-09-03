import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// טבלאות מותרות לחיפוש "הבקשה הממתינה הבאה"
const ALLOWED: Record<string, string> = {
  loans: 'pending',
  maternity_aids: 'pending',
  financial_aid_requests: 'pending',
  widow_requests: 'pending',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מחזיר את מזהה הבקשה הממתינה הבאה (לפי סדר כניסה), או null אם אין.
export async function GET(request: NextRequest) {
  if (!(await requireNonMailStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const url = new URL(request.url)
  const table = url.searchParams.get('table') ?? ''
  const currentId = url.searchParams.get('currentId') ?? ''
  const pendingParam = url.searchParams.get('pending')
  if (!(table in ALLOWED)) return NextResponse.json({ error: 'טבלה לא נתמכת' }, { status: 400 })

  const pendingValues = pendingParam ? pendingParam.split(',').map(s => s.trim()).filter(Boolean) : [ALLOWED[table]]

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ id: null })

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 תיק שנשלח אליו בירור וטרם נענה — אינו "הבא בתור".
  //
  // ⚠️ הבחירה הייתה לפי status בלבד, והתיק נשאר deep_review גם אחרי
  // שנשלחה למשפחה שאלה. התוצאה: המנהל אישר תיק, קפץ אוטומטית לתיק שכבר
  // מחכה לתשובה מהמשפחה — ולא היה לו מה לעשות איתו. הוא חזר ונתקע באותו
  // תיק בכל סבב, כי הוא הוותיק ביותר בתור.
  //
  // ⚠️ נשלף מעט יותר מאחד ומסננים בקוד: הקשר "ההודעה האחרונה בכל תיק"
  // אינו ניתן לביטוי ב-PostgREST בשאילתה אחת, וריבוי קריאות היה מאט את
  // הקפיצה שאמורה להיות מיידית.
  // ─────────────────────────────────────────────────────────────────────────
  let q = admin.from(table).select('id').in('status', pendingValues)
    .order('created_at', { ascending: true }).limit(40)
  if (currentId) q = q.neq('id', currentId)
  const { data } = await q
  const ids = (data ?? []).map(r => String((r as { id: string }).id))
  if (!ids.length) {
    return NextResponse.json({ id: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // רק ליולדות יש מנגנון בירור. שאר הטבלאות מדלגות על הבדיקה.
  if (table !== 'maternity_aids') {
    return NextResponse.json({ id: ids[0] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: msgs } = await admin
    .from('maternity_messages')
    .select('aid_id, direction, created_at')
    .in('aid_id', ids)

  // ⚠️ "ממתין לתשובה" = ההודעה **האחרונה** בתיק היא מהצוות. תשובה של
  // המשפחה ('applicant') אחריה מחזירה את התיק לתור, כי אז יש מה להכריע.
  //
  // ⚠️ ממוין בקוד ולא בשאילתה — אותו שיקול בדיוק כמו ב-lib/maternityCounts:
  // הספירה לא תסתמך על סדר שהמסד עשוי לשנות.
  const sorted = [...((msgs ?? []) as { aid_id: string; direction: string; created_at: string }[])]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const lastDir = new Map<string, string>()
  for (const m of sorted) if (!lastDir.has(m.aid_id)) lastDir.set(m.aid_id, m.direction)

  const next = ids.find(id => lastDir.get(id) !== 'staff') ?? null
  return NextResponse.json({ id: next }, { headers: { 'Cache-Control': 'no-store' } })
}
