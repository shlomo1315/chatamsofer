import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ביטול שינוי ייחוס — החזרת המצב שהיה לפני השינוי האחרון.
//
// 🔴 עד עכשיו שינוי דור בכרטסת היה בלתי הפיך: לחיצה אחת דרסה את שרשרת
// הדורות, ולעתים גם החזירה משפחה מאושרת ל"ממתין לאישור". בעץ יש שמות
// כמעט זהים בדורות סמוכים, ובחירה שגויה לא הייתה ניתנת לתיקון.
//
// ⚠️ מבטל את השינוי *האחרון* בלבד, ולא רשומה שרירותית לפי מזהה: ביטול
// שינוי ישן היה מחזיר מצב שכבר נדרס פעמיים ומייצר שרשרת שגויה.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ⚠️ אותה הרשאה בדיוק כמו השיוך עצמו: מי שיכול לשנות חייב לדעת לתקן.
  // רשימת תפקידים נפרדת כאן הייתה נותנת לאדם לבצע שינוי בלי יכולת לבטלו.
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden('אין הרשאה לבטל שינוי ייחוס')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let beneficiaryId = ''
  try {
    const body = await request.json() as { beneficiaryId?: string }
    beneficiaryId = String(body?.beneficiaryId ?? '')
  } catch { /* גוף לא תקין → נתפס בבדיקה הבאה */ }
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const { data: last } = await db.from('lineage_assign_log')
    .select('id, prev_chain, prev_node_id, prev_eligibility')
    .eq('beneficiary_id', beneficiaryId)
    .is('undone_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!last) return NextResponse.json({ error: 'אין שינוי לביטול' }, { status: 404 })

  const row = last as {
    id: string
    prev_chain: unknown
    prev_node_id: string | null
    prev_eligibility: string | null
  }

  const { error: uErr } = await db.from('beneficiaries').update({
    lineage_chain: row.prev_chain,
    lineage_node_id: row.prev_node_id,
    // ⚠️ הסטטוס משוחזר גם הוא: השיוך עשוי היה להוריד משפחה
    // מ-deep_review ל-pending, וביטול חלקי היה משאיר אותה מאושרת בטעות.
    ...(row.prev_eligibility ? { eligibility_status: row.prev_eligibility } : {}),
  }).eq('id', beneficiaryId)

  if (uErr) return NextResponse.json({ error: 'השחזור נכשל' }, { status: 500 })

  // ⚠️ מסומן כמבוטל רק *אחרי* שהשחזור הצליח, אחרת כשל בכתיבה היה
  // סוגר את הרשומה ומשאיר את המשפחה במצב השגוי בלי דרך חזרה.
  await db.from('lineage_assign_log')
    .update({ undone_at: new Date().toISOString() })
    .eq('id', row.id)

  return NextResponse.json({ ok: true })
}
