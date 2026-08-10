import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תיקון חד-פעמי: החזרת משפחות שנדחו אוטומטית מהעץ.
//
// בין 04/08 ל-10/08 דחיית צומת בעץ הדורות כתבה eligibility_status='rejected'
// לכל הכרטסות בתת-העץ (rejectLinkedBeneficiaries, הוסרה). משפחות שאיש לא
// הכריע לגביהן סומנו כנדחות.
//
// ⚠️ הסטטוס הקודם נדרס ולא נשמר בשום מקום — לא ב-activity_log (שרשם מונה
// בלבד) ולא בעמודה אחרת. לכן ההחזרה היא ל-'pending': המשפחה חוזרת לתור
// ההחלטה במקום להישאר עם החלטה שלא התקבלה.
//
// הזיהוי לפי rejection_reason המדויק שהמנגנון האוטומטי כתב. דחייה ידנית
// נושאת נימוק אחר, ולכן אינה נכללת — וזה העיקר: התיקון אינו נוגע בשום
// החלטה אנושית.
//
// GET  — תצוגה מקדימה, בלי לשנות כלום.
// POST — מבצע. אידמפוטנטי: אחרי הריצה השורות כבר אינן תואמות לסינון.
// מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_REASON = 'היחוס נדחה בעץ הדורות'

type Row = { id: string; full_name: string | null; family_name: string | null; id_number: string | null; updated_at: string | null }

async function affected(admin: NonNullable<ReturnType<typeof getServiceClient>>) {
  // שליפה בדפים — .limit() לבדו נחתך ב-db-max-rows=1000 (ראו lib/fetchAllRows).
  return fetchAllRows<Row>((from, to) =>
    admin.from('beneficiaries')
      .select('id, full_name, family_name, id_number, updated_at')
      .eq('eligibility_status', 'rejected')
      .eq('rejection_reason', AUTO_REASON)
      .range(from, to),
  )
}

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows, error } = await affected(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({
    count: rows.length,
    summary: rows.length
      ? `${rows.length} משפחות נדחו אוטומטית מהעץ. POST לנתיב זה יחזיר אותן ל"ממתין לאישור".`
      : 'לא נמצאו משפחות שנדחו אוטומטית מהעץ.',
    families: rows.map(r => ({
      id: r.id,
      name: [r.family_name, r.full_name].filter(Boolean).join(' ') || 'ללא שם',
      idNumber: r.id_number,
      rejectedAt: r.updated_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // נשמרות מראש כדי שהתיעוד יכיל את מי שהוחזר בפועל — אחרי העדכון הן כבר
  // לא תואמות לסינון ולא ניתן יהיה לשחזר את הרשימה.
  const { rows, error: readErr } = await affected(admin)
  if (readErr) return NextResponse.json({ error: readErr }, { status: 500 })
  if (!rows.length) {
    return NextResponse.json({ restored: 0, summary: 'לא נמצאו משפחות שנדחו אוטומטית מהעץ — לא בוצע שינוי.' })
  }

  const { data, error } = await admin
    .from('beneficiaries')
    .update({ eligibility_status: 'pending', rejection_reason: null, updated_at: new Date().toISOString() })
    .eq('eligibility_status', 'rejected')
    .eq('rejection_reason', AUTO_REASON)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const restored = (data ?? []).length
  await logActivity(admin, {
    userId: staff.userId,
    action: 'beneficiaries_auto_rejection_reverted',
    entityType: 'beneficiary',
    details: { count: restored, ids: rows.map(r => r.id).slice(0, 500) },
  }).catch(() => {})

  console.log(`[lineage-repair] הוחזרו ${restored} משפחות מדחייה אוטומטית ל'ממתין לאישור'`)
  return NextResponse.json({
    restored,
    summary: `${restored} משפחות הוחזרו ל"ממתין לאישור". סיבת הדחייה האוטומטית נוקתה.`,
  })
}
