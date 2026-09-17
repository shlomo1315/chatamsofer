// ─────────────────────────────────────────────────────────────────────────────
// אבחון קריאה-בלבד: קבוצות "הגבלת חנויות" של מוסד החגים בנדרים.
//
// 🔴 למה זה נחוץ כנקודת cron ולא כמסך: נדרים מגבילה את מפתח ה-API לפי כתובת
// IP, ורק שרת הפרודקשן מורשה. שליפה ממחשב מקומי מוחזרת כ-
// "מפתח API זה אינו מורשה לגשת מכתובת IP ..." — ולכן את המזהה אפשר לראות
// רק מתוך השרת עצמו.
//
// ⚠️ מוגן ב-CRON_SECRET ונכשל-סגור, כמו שאר נקודות ה-cron. אין כאן סשן
// משתמש ולכן אין מסלול הרשאות אחר.
//
// ⚠️ קריאה בלבד: GetLimitedStoresList אינה משנה דבר בנדרים. אין כאן
// SaveLimitedStores ואין AddTlush — נקודת אבחון שמבצעת כתיבה היא בדיוק
// הדרך שבה "בדיקה" הופכת לתקלה.
//
// ⚠️ הסיסמאות אינן מוחזרות בתשובה — רק קוד המוסד, שאינו סוד.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret } from '@/lib/apiAuth'
import { getHolidayNedarimCreds, getNedarimCreds, getLimitedStoresList, getHolidayLimitedId } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const okToken = verifyCronSecret(request)
    || request.nextUrl.searchParams.get('token') === process.env.CRON_SECRET
  if (!process.env.CRON_SECRET || !okToken) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  const out: Record<string, unknown> = {
    // המזהה השמור אצלנו כרגע. ריק = הטעינה יוצאת בלי אכיפת חנויות.
    savedHolidayLimitedId: await getHolidayLimitedId() || null,
  }

  // ⚠️ שני המוסדות נשלפים בנפרד: קבוצות הגבלה הן פר-מוסד, וקבוצה של
  // מוסד היולדות (7018265) אינה תקפה לטעינת חגים במוסד 7014553.
  for (const [label, getter] of [
    ['holiday', getHolidayNedarimCreds],
    ['maternity', getNedarimCreds],
  ] as const) {
    try {
      const creds = await getter()
      if (!creds) { out[label] = { error: 'לא הוגדרו הרשאות' }; continue }
      const { groups, raw } = await getLimitedStoresList(creds)
      out[label] = {
        mosadId: creds.mosadId,
        count: groups.length,
        groups,
        // המבנה הגולמי — כדי לזהות את שם השדה המדויק שנדרים מחזירה בו את המזהה.
        raw,
      }
    } catch (e) {
      // ⚠️ שגיאה מנדרים מוצגת כשגיאה ולא כ"אפס קבוצות" — זה היה הבאג
      // שהסתיר קבוצה קיימת והציג "החיבור תקין · 0 קבוצות".
      out[label] = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json(out)
}
