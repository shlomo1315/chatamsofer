import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// ── קליטת קריסות שקורות בדפדפן ──
//
// 🔴 למה: קריסת לשונית ("This page couldn't load") אינה מגיעה ללוגים של
// השרת בכלל. הבאג של רישום הלידה התגלה רק כי משתמש סיפר עליו — ובינתיים
// הוא הפיל לשוניות של משפחות נוספות בלי שידענו. עכשיו כל קריסה כזו
// נרשמת בלוג עם הכתובת שבה היא קרתה.
//
// ⚠️ אין כאן שום PII: רק הודעת השגיאה, ה-stack והכתובת. לא נשלחים
// פרטי מוטב, ולכן אין צורך באימות — מי שקרס אצלו הדף לא בהכרח מחובר.

export async function POST(request: NextRequest) {
  // הגבלת קצב — דף שנתקע בלולאה עלול לדווח בקצב גבוה. די בדיווחים
  // ראשונים כדי לזהות את התקלה; השאר רק היו מציפים את הלוג.
  if (!rateLimit(`client-error:${clientIp(request)}`, 20, 60 * 1000)) {
    return NextResponse.json({ ok: true, throttled: true })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const message = String(body?.message ?? '').slice(0, 500)
    const url = String(body?.url ?? '').slice(0, 300)
    const stack = String(body?.stack ?? '').slice(0, 2000)
    const componentStack = String(body?.componentStack ?? '').slice(0, 2000)

    console.error(`[client-error] ${message} · url=${url}`)
    if (stack) console.error(`[client-error] stack: ${stack}`)
    if (componentStack) console.error(`[client-error] component: ${componentStack}`)
  } catch {
    // דיווח פגום — לא מפילים את נקודת הקצה שתפקידה לתעד תקלות
  }

  // תמיד 200: הדפדפן כבר במצב שגיאה, ואין טעם להכשיל גם את הדיווח.
  return NextResponse.json({ ok: true })
}
