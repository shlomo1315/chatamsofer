import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  getHolidayNedarimCreds, saveHolidayNedarimCreds, clearHolidayNedarimCreds,
  hasSeparateHolidayCreds, getHolidayLimitedId, saveHolidayLimitedId,
  getLimitedStoresList,
} from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הרשאת נדרים של מחלקת חלוקות החגים — נפרדת מזו של היולדות.
//
// ⚠️ למה נפרדת: החגים והיולדות הם שני תקציבים ושתי קבוצות הגבלת חנויות בנדרים,
// ולעיתים שני מוסדות. הרשאה אחת לשניהם הייתה מקשרת טעינת חג לתקציב היולדות,
// וזה בלתי-הפיך מבחינת הדיווח.
//
// ⚠️ כשלא הוגדרה הרשאה נפרדת — נופלים לראשית ולא נכשלים: שיוך הכרטיס בשלוחה
// הטלפונית עובד היום עם הראשית, והשבתתו בפריסה הייתה תקלה שאיש לא ביקש.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const [creds, separate, limitedId] = await Promise.all([
    getHolidayNedarimCreds(), hasSeparateHolidayCreds(), getHolidayLimitedId(),
  ])
  return NextResponse.json({
    // configured = יש במה לעבוד (נפרד או ראשי); separate = הוגדרה הרשאה נפרדת
    configured: !!creds,
    separate,
    mosadId: separate ? (creds?.mosadId ?? '') : '',
    // כשאין הרשאה נפרדת — מציגים למנהל באיזה מוסד הפעולות ירוצו בפועל
    inheritedMosadId: separate ? '' : (creds?.mosadId ?? ''),
    limitedId,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  let body: { mosadId?: string; apiPassword?: string; limitedId?: string; clear?: boolean; test?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ── בדיקת חיבור ──
  // ⚠️ קריאת-קריאה בלבד (רשימת קבוצות הגבלת חנויות): בדיקה שכותבת משהו לנדרים
  // הייתה משאירה זבל בכל לחיצה על "בדוק חיבור".
  if (body.test) {
    const creds = await getHolidayNedarimCreds()
    if (!creds) return NextResponse.json({ error: 'לא הוגדרה הרשאת נדרים' }, { status: 400 })
    try {
      const { groups } = await getLimitedStoresList(creds)
      return NextResponse.json({
        ok: true, mosadId: creds.mosadId, groupCount: groups.length,
        groups: groups.slice(0, 40),
      })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'החיבור נכשל' }, { status: 502 })
    }
  }

  if (body.clear) {
    if (!(await clearHolidayNedarimCreds())) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
    return NextResponse.json({ ok: true, separate: false })
  }

  const mosadId = (body.mosadId ?? '').trim()
  const apiPassword = (body.apiPassword ?? '').trim()
  const wantsCreds = mosadId !== '' || apiPassword !== ''
  const wantsLimited = body.limitedId !== undefined

  if (!wantsCreds && !wantsLimited) return NextResponse.json({ error: 'לא נשלחו נתונים לעדכון' }, { status: 400 })

  if (wantsCreds) {
    if (!mosadId || !apiPassword) return NextResponse.json({ error: 'יש להזין קוד מוסד וקוד API' }, { status: 400 })
    if (!/^\d{4,9}$/.test(mosadId)) return NextResponse.json({ error: 'קוד מוסד אמור להיות מספר (עד 9 ספרות)' }, { status: 400 })
    if (!(await saveHolidayNedarimCreds({ mosadId, apiPassword }))) {
      return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
    }
  }

  if (wantsLimited) {
    const limitedId = String(body.limitedId).trim()
    if (limitedId && !/^\d{1,10}$/.test(limitedId)) {
      return NextResponse.json({ error: 'מזהה קבוצת הגבלת חנויות אמור להיות מספר' }, { status: 400 })
    }
    if (!(await saveHolidayLimitedId(limitedId))) return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
