import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { normalizeId } from '@/lib/legacyLoans'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול ההלוואות מהמערכת הקודמת — עריכה ומחיקה.
//
// הרשומות מיובאות מאקסל (scripts/legacy-loans-to-sql.mjs), אך יש בהן שגיאות
// שצריך לתקן ידנית: ת"ז חסרה, ת"ז בת 10 ספרות, שם משובש.
//
// 🔴 כל עריכה מסמנת manually_edited=true, וייבוא חוזר של אותו אקסל **מדלג**
// על שורות כאלה. בלי זה כל ייבוא חוזר היה דורס בשקט את התיקונים.
//
// ⚠️ id_number מנורמל לספרות בלבד — אותו נרמול בדיוק כמו בייבוא ובחיפוש.
// אם המזכיר יקליד ת"ז עם מקפים, השיוך היה נכשל בשקט.
// ─────────────────────────────────────────────────────────────────────────────

/** שדות שניתן לערוך מהמסך. כל השאר (id, source_row) אינם ניתנים לשינוי. */
const EDITABLE = [
  'file_number', 'fund', 'id_number', 'borrower_name',
  'address', 'city', 'phone', 'email',
  'approved_amount', 'taken_amount', 'installments',
] as const

const NUMERIC = new Set(['approved_amount', 'taken_amount', 'installments'])

export async function PATCH(request: NextRequest) {
  const staff = await requirePermission('loans', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (!(key in body)) continue
    const raw = body[key]

    if (NUMERIC.has(key)) {
      // ⚠️ מחרוזת ריקה → null ולא 0. ב-taken_amount זו ההבחנה כולה:
      // null = "אושר ולא נלקח", אפס = "בוצע בסכום אפס".
      const s = String(raw ?? '').trim()
      if (s === '') { patch[key] = null; continue }
      const n = Number(s.replace(/[^0-9.\-]/g, ''))
      if (!Number.isFinite(n)) return NextResponse.json({ error: `ערך לא תקין בשדה ${key}` }, { status: 400 })
      // ⚠️ ערך מוחלט: הסכומים נשמרים חיוביים (באקסל הם שליליים).
      patch[key] = key === 'installments' ? Math.round(Math.abs(n)) : Math.abs(n)
      continue
    }

    if (key === 'id_number') {
      // 🔴 נרמול לספרות בלבד — אחרת ת"ז שהוקלדה עם מקף לא תשויך לאף משפחה.
      const digits = normalizeId(raw)
      patch[key] = digits || null
      continue
    }

    const s = String(raw ?? '').trim()
    patch[key] = s === '' ? null : s
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'לא נשלחו שינויים' }, { status: 400 })
  }

  // 🔴 הסימון שמגן על התיקון מפני ייבוא חוזר.
  patch.manually_edited = true
  patch.updated_at = new Date().toISOString()

  const { error } = await db.from('legacy_loans').update(patch).eq('id', id)
  if (error) {
    // מספר תיק כפול — האינדקס הייחודי תפס. הודעה מובנת במקום טקסט מסד.
    if (String((error as { code?: string }).code) === '23505') {
      return NextResponse.json({ error: 'מספר תיק זה כבר קיים ברשומה אחרת' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logActivity(db, {
    userId: staff.userId, action: 'legacy_loan_updated', entityType: 'legacy_loan',
    entityId: id, details: { fields: Object.keys(patch).filter(k => k !== 'updated_at') },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('loans', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const id = String(request.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // ⚠️ נשלף לפני המחיקה, כדי שהיומן יתעד *מה* נמחק ולא רק מזהה אטום —
  // רשומה שנמחקה בטעות אינה ניתנת לשחזור מהיומן בלי הפרטים.
  const { data: row } = await db
    .from('legacy_loans')
    .select('file_number, borrower_name, id_number, approved_amount, taken_amount')
    .eq('id', id).maybeSingle()

  const { error } = await db.from('legacy_loans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'legacy_loan_deleted', entityType: 'legacy_loan',
    entityId: id, details: { deleted: row ?? null },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
