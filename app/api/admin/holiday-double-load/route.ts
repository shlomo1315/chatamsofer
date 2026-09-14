import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getHolidayNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { DEFAULT_LOAD_AMOUNT } from '@/lib/holidayCardLoad'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 איתור טעינות כפולות בחלוקת החגים — קריאה בלבד.
//
// ⚠️ אי אפשר לאתר אותן מהמסד שלנו: *ההגדרה* של הבאג היא שהטעינה השנייה
// לא נרשמה כאן. לכן מקור האמת היחיד הוא נדרים, ולכל משפחה נשלפת רשימת
// הטעינות שלה ונספרות אלה ששייכות לחלוקת החגים.
//
// הבאג: addTlush נשלחת בלי שום מפתח ייחודיות (LimitedId הוא הגבלת חנויות
// בלבד), והכתיבה של load_status='loaded' אצלנו קורית *אחרי* שהכסף כבר יצא.
// ריצה שנקטעת בין השניים משאירה שורה שנראית "לא נטענה" — ונטענת שוב.
//
// 🔴 לא מבצע פריקה ולא משנה דבר. מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────

/** טעינה בודדת כפי שנדרים מחזירה. המפתחות אינם אחידים — נבדקות כמה חלופות. */
function extractTlushim(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!payload) return []
  for (const key of ['Tlushim', 'Tlushim_Table', 'Loads', 'Tlush']) {
    const v = payload[key]
    if (Array.isArray(v)) return v as Record<string, unknown>[]
  }
  // ⚠️ נפילה אחרונה: סורקים מערכים עליונים ומחפשים פריטים שנראים כטעינה.
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.some(x => x && typeof x === 'object'
      && ('Amount' in (x as object) || 'TlushId' in (x as object)))) {
      return v as Record<string, unknown>[]
    }
  }
  return []
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const creds = await getHolidayNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'לא הוגדרו הרשאות נדרים לחלוקות חגים' }, { status: 500 })

  // ⚠️ fetchAllRows — תקרת 1,000 השקטה הייתה חותכת את הבדיקה בשקט.
  const { rows } = await fetchAllRows<{
    id: string; loaded_at: string | null; card_number: string | null
    beneficiary: { id_number: string | null; family_name: string | null; full_name: string | null; nedarim_id: string | null }
      | { id_number: string | null; family_name: string | null; full_name: string | null; nedarim_id: string | null }[] | null
  }>((from, to) => admin
    .from('distribution_recipients')
    .select('id, loaded_at, card_number, beneficiary:beneficiaries(id_number, family_name, full_name, nedarim_id)')
    .eq('load_status', 'loaded')
    .order('loaded_at')
    .range(from, to))

  const doubles: Record<string, unknown>[] = []
  const errors: Record<string, unknown>[] = []
  let checked = 0

  for (const r of rows) {
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    const nedId = b?.nedarim_id
    if (!nedId) { errors.push({ id: r.id, name: b?.family_name, reason: 'אין מזהה נדרים' }); continue }

    let payload: Record<string, unknown> | null = null
    try {
      payload = (await getClientCardFull(creds, String(nedId))) as Record<string, unknown> | null
    } catch (e) {
      errors.push({ id: r.id, name: b?.family_name, reason: e instanceof Error ? e.message : 'תקלה' })
      continue
    }
    checked++

    // רק טעינות בסכום החלוקה. סכומים אחרים שייכים לתוכניות אחרות.
    const all = extractTlushim(payload)
    const holiday = all.filter(t => num(t.Amount) === DEFAULT_LOAD_AMOUNT)

    if (holiday.length > 1) {
      doubles.push({
        recipientId: r.id,
        idNumber: b?.id_number ?? null,
        name: [b?.family_name, b?.full_name].filter(Boolean).join(' '),
        nedarimId: String(nedId),
        cardNumber: r.card_number,
        ourLoadedAt: r.loaded_at,
        loadsInNedarim: holiday.length,
        totalLoaded: holiday.reduce((s, t) => s + num(t.Amount), 0),
        tlushim: holiday.map(t => ({ id: t.TlushId ?? t.Id ?? null, amount: num(t.Amount), date: t.Date ?? t.CreateDate ?? null })),
      })
    }

    // נדרים חוסמת קצב על קריאות רצופות.
    await new Promise(res => setTimeout(res, 120))
  }

  return NextResponse.json({
    summary: {
      loadedInOurDb: rows.length,
      checkedAgainstNedarim: checked,
      familiesWithDoubleLoad: doubles.length,
      excessShekels: doubles.reduce((s, d) => s + (Number(d.totalLoaded) - DEFAULT_LOAD_AMOUNT), 0),
      errors: errors.length,
    },
    doubles,
    errors: errors.slice(0, 50),
  })
}
