import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { getHolidayNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { DEFAULT_LOAD_AMOUNT, countHolidayLoads } from '@/lib/holidayCardLoad'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 איתור טעינות כפולות בחלוקת החגים — קריאה בלבד. מנהל בלבד.
//
// ⚠️ אי אפשר לאתר אותן מהמסד שלנו: *ההגדרה* של הבאג היא שהטעינה השנייה
// לא נרשמה כאן. לכן מקור האמת היחיד הוא נדרים, ולכל משפחה נשלפת רשימת
// הטעינות שלה ונספרות אלה שבסכום החלוקה.
//
// 🔴 רץ באצוות ולא במכה אחת: 924 משפחות × השהיית קצב = מעל 100 שניות,
// ו-Cloudflare חותך ב-100 (שגיאה 524) — הסריקה נקטעה בלי שום תוצאה.
// כל קריאה מטפלת ב-`limit` משפחות ומחזירה `nextOffset` להמשך.
//
// שימוש:  /api/admin/holiday-double-load?offset=0&limit=120
//         ואז עם ה-nextOffset שחזר, עד ש-done=true.
// ─────────────────────────────────────────────────────────────────────────────

/** ברירת מחדל שמסתיימת בבטחה בתוך חלון ה-100 שניות של Cloudflare. */
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 300
/** נדרים חוסמת קצב על קריאות רצופות. */
const DELAY_MS = 120

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const creds = await getHolidayNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'לא הוגדרו הרשאות נדרים לחלוקות חגים' }, { status: 500 })

  const sp = req.nextUrl.searchParams
  const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(sp.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT))

  // ⚠️ fetchAllRows — תקרת 1,000 השקטה הייתה חותכת את הבדיקה בשקט.
  // ⚠️ סדר יציב (loaded_at, id) חובה: בלעדיו אצווה שנייה עלולה לדלג על
  // משפחות או לבדוק אותן פעמיים, והדוח היה חסר בלי שיידע איש.
  const { rows } = await fetchAllRows<{
    id: string; loaded_at: string | null; card_number: string | null
    beneficiary: { id_number: string | null; family_name: string | null; full_name: string | null; nedarim_id_holiday: string | null }
      | { id_number: string | null; family_name: string | null; full_name: string | null; nedarim_id_holiday: string | null }[] | null
  }>((from, to) => admin
    .from('distribution_recipients')
    .select('id, loaded_at, card_number, beneficiary:beneficiaries(id_number, family_name, full_name, nedarim_id_holiday)')
    .eq('load_status', 'loaded')
    .order('loaded_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to))

  const slice = rows.slice(offset, offset + limit)
  const doubles: Record<string, unknown>[] = []
  const errors: Record<string, unknown>[] = []
  let checked = 0

  for (const r of slice) {
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    const nedId = b?.nedarim_id_holiday
    if (!nedId) { errors.push({ id: r.id, name: b?.family_name, reason: 'אין מזהה נדרים' }); continue }

    let payload: unknown = null
    try {
      payload = await getClientCardFull(creds, String(nedId))
    } catch (e) {
      errors.push({ id: r.id, name: b?.family_name, reason: e instanceof Error ? e.message : 'תקלה' })
      continue
    }
    checked++

    const count = countHolidayLoads(payload, DEFAULT_LOAD_AMOUNT)
    if (count > 1) {
      doubles.push({
        idNumber: b?.id_number ?? null,
        name: [b?.family_name, b?.full_name].filter(Boolean).join(' '),
        nedarimId: String(nedId),
        cardNumber: r.card_number,
        ourLoadedAt: r.loaded_at,
        loadsInNedarim: count,
        excessShekels: (count - 1) * DEFAULT_LOAD_AMOUNT,
      })
    }

    await new Promise(res => setTimeout(res, DELAY_MS))
  }

  const nextOffset = offset + slice.length
  const done = nextOffset >= rows.length

  return NextResponse.json({
    progress: {
      totalLoaded: rows.length,
      scannedSoFar: nextOffset,
      inThisBatch: slice.length,
      checkedAgainstNedarim: checked,
      done,
      // 🔴 הכתובת להמשך — עד done=true.
      nextUrl: done ? null : `/api/admin/holiday-double-load?offset=${nextOffset}&limit=${limit}`,
    },
    foundInThisBatch: {
      familiesWithDoubleLoad: doubles.length,
      excessShekels: doubles.reduce((s, d) => s + Number(d.excessShekels ?? 0), 0),
    },
    doubles,
    errors: errors.slice(0, 50),
  })
}
