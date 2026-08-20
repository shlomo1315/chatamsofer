import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getWorkspaceGmailClient, isWorkspaceConfigured } from '@/lib/googleWorkspace'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// רשימת התוויות הקיימות בתיבת היעד של הייבוא.
//
// משמשת את הבורר של "שייך תווית": המנהל בוחר תווית קיימת או מקליד שם חדש,
// ולכן הוא חייב לראות מה כבר קיים — אחרת ייווצרו כפילויות בשמות דומים.
//
// ⚠️ תוויות המערכת של Gmail (INBOX, SENT, SPAM…) מסוננות. הן אינן תוויות
// שהמנהל יכול לתייג בהן ארכיון, והצגתן רק מסתירה את התוויות האמיתיות.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  let accountId: string | null = null
  try { accountId = (await request.json())?.accountId ?? null } catch { /* גוף ריק */ }
  if (!accountId) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  const db = admin()
  const { data: acc } = await db
    .from('gmail_accounts')
    .select('id, department, import_target_email')
    .eq('id', accountId)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })

  if (!isWorkspaceConfigured()) {
    return NextResponse.json({ error: 'חיבור Google Workspace אינו מוגדר בשרת' }, { status: 400 })
  }

  // כתובת היעד: מה שהוגדר ידנית לתיבה, ובנפילה — כתובת המחלקה.
  // ⚠️ אותו סדר בדיוק כמו בייבוא עצמו (legacyMailSync) — אחרת הבורר היה
  // מציג תוויות מתיבה אחת והייבוא היה מתייג בתיבה אחרת.
  const target = String(acc.import_target_email ?? '').trim()
    || DEPARTMENTS[acc.department as DepartmentKey]?.email
  if (!target) {
    return NextResponse.json({ error: 'לא הוגדרה כתובת יעד לייבוא עבור תיבה זו' }, { status: 400 })
  }

  try {
    const gmail = getWorkspaceGmailClient(target)
    const list = await gmail.users.labels.list({ userId: 'me' })
    const labels = (list.data.labels ?? [])
      // ⚠️ type === 'user' בלבד: תוויות המערכת אינן ניתנות לשימוש כארכיון.
      .filter((l: { id?: string|null; name?: string|null; type?: string|null }) => l.type === 'user' && l.id && l.name)
      .map((l: { id?: string|null; name?: string|null }) => ({ id: String(l.id), name: String(l.name) }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'he'))
    return NextResponse.json({ ok: true, target, labels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[gmail-labels] שליפת התוויות נכשלה:', msg)
    return NextResponse.json({ error: `שליפת התוויות מ-Gmail נכשלה: ${msg}` }, { status: 502 })
  }
}
