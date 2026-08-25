import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// החזרת כרטיס למלאי לפני מחיקת תיק לידה.
//
// 🔴 כל אישור לידה מנכה כרטיס מהמלאי. ביטול אישור מחזיר אותו, אבל *מחיקת
// התיק* לא החזירה — והכרטיס נשאר מנוכה בלי שום דרך לזהות למי הוא שייך:
// עם התיק נמחק גם הקישור אליו.
//
// התוצאה היא בדיוק ההפרש שמופיע במסך המלאי ("כרטיסים נוכו ואינם מגובים
// בלידה מאושרת"), והדרך היחידה לסגור אותו בדיעבד היא ספירה פיזית — כי
// אין למי להחזיר.
//
// ⚠️ נקרא *לפני* המחיקה, מאותה סיבה שפריקת הכסף נקראת לפניה: אחרי
// המחיקה אין ממה לגזור את השיוך.
//
// ⚠️ מוחזר רק כרטיס שנוכה בפועל — כלומר תיק שהגיע לכדי אישור. תיק
// שנמחק בעודו 'ממתין' לא ניכה דבר, והחזרה עליו הייתה *מוסיפה* כרטיס
// שלא היה קיים.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff || staff instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { aidId?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const aidId = String(body.aidId ?? '').trim()
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  // ⚠️ נשען על היומן ולא על סטטוס התיק: היומן הוא מקור האמת ל"האם נוכה
  // כרטיס", והוא גם מונע החזרה כפולה אם המחיקה נוסתה פעמיים.
  const { data: moves, error } = await db
    .from('card_stock_ledger')
    .select('delta, reason')
    .eq('aid_id', aidId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const net = (moves ?? []).reduce((s, m) => s + Number((m as { delta: number }).delta ?? 0), 0)

  // net === 0 → או שלא נוכה כלום, או שכבר הוחזר. בשני המקרים אין מה לעשות.
  if (net >= 0) {
    return NextResponse.json({ ok: true, released: 0, reason: 'לא נוכה כרטיס עבור תיק זה' })
  }

  const { error: insErr } = await db.from('card_stock_ledger').insert({
    delta: -net,             // מחזיר בדיוק את מה שנוכה
    reason: 'adjust',
    aid_id: aidId,
    note: 'החזרה למלאי — התיק נמחק',
    created_by: staff.userId,
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, released: -net })
}
