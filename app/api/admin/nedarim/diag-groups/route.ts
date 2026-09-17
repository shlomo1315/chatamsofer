import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, getHolidayNedarimCreds, getLimitedStoresList, findClientByZeout, getClientCardFull } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// אבחון קריאה-בלבד: מציג את קבוצות "הגבלת חנויות" בנדרים (שם + מזהה מדויקים),
// ואם נמסר ?zeout= — גם את מבנה הטעינות (Tlushim) של אותה משפחה, כדי לזהות איך
// נדרים מקשרת טעינה לקבוצת הגבלה. לא מבצע שום כתיבה/פעולה חיה.
// ⚠️ מנהל בלבד: הנקודה מחזירה את טבלת המשפחות המלאה מנדרים (שמות, ת"ז,
// כרטיסים). ההגדרות של נדרים כבר היו מוגנות למנהל, והנתונים עצמם לא — חוסר
// עקביות שהותיר את המידע הרגיש פתוח לכל תפקיד צוות.
export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'נדרים קארד אינו מוגדר' }, { status: 400 })

  const out: Record<string, unknown> = {}
  try {
    const { groups, raw } = await getLimitedStoresList(creds)
    out.limitedStores = { mosadId: creds.mosadId, groups, raw }
  } catch (e) {
    out.limitedStoresError = e instanceof Error ? e.message : String(e)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 🔴 קבוצות מוסד *החגים* — בנפרד.
  //
  // ⚠️ הקבוצות למעלה נשלפות עם ההרשאה הראשית (מוסד היולדות, 7018265),
  // וקבוצות הגבלה הן לכל מוסד בנפרד. מי שחיפש כאן את מזהה הקבוצה של החגים
  // (7014553) פשוט לא ראה אותה — וזה חלק ממה שהותיר את LimitedId של החגים
  // ריק ואת 3,878 הטעינות בלי אכיפת חנויות.
  //
  // ⚠️ נדלג כשאין הרשאה נפרדת: getHolidayNedarimCreds נופלת-לאחור לראשית,
  // ושליפה כפולה של אותו מוסד רק מכפילה פניות לנדרים בלי להוסיף מידע.
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const holidayCreds = await getHolidayNedarimCreds()
    if (holidayCreds && holidayCreds.mosadId !== creds.mosadId) {
      const { groups, raw } = await getLimitedStoresList(holidayCreds)
      out.holidayLimitedStores = { mosadId: holidayCreds.mosadId, groups, raw }
    }
  } catch (e) {
    out.holidayLimitedStoresError = e instanceof Error ? e.message : String(e)
  }

  const zeout = request.nextUrl.searchParams.get('zeout')?.trim()
  if (zeout) {
    try {
      const clientId = await findClientByZeout(creds, zeout)
      if (!clientId) {
        out.client = { error: 'לא נמצאה משפחה עם ת"ז זו בנדרים' }
      } else {
        const full = await getClientCardFull(creds, clientId)
        out.client = {
          clientId,
          // מציגים את המבנה הגולמי המלא כדי לזהות שדות של קבוצת הגבלה/הגבלת חנויות בטעינות
          raw: full,
        }
      }
    } catch (e) {
      out.client = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
