import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { cleanEmail, emailError } from '@/lib/emailAddress'

// הרשמה לתזכורת פתיחת היריד.
//
// ⚠️ נתיב ציבורי לחלוטין — הוא מוצג בדף ההמתנה למי שאינו מחובר.
// ההגנות: rate limit לפי IP, ולידציית כתובת, ואורך מרבי. אין כאן שום
// נתון רגיש; הסיכון היחיד הוא הצפה, וזה מה שה-rate limit מכסה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  // 5 הרשמות ל-10 דקות: אדם אחד נרשם פעם אחת, וזה מרווח בשפע גם
  // למשפחה שלמה מאותו חיבור.
  if (!rateLimit(`fair-remind:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'נסו שוב בעוד כמה דקות' }, { status: 429 })
  }

  let body: { email?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // ⚠️ הניקוי והבדיקה מגיעים מ-lib/emailAddress — אותו מקור אמת בדיוק
  // שהטופס משתמש בו. שני ביטויים נפרדים היו יוצרים מצב שבו הטופס מאשר
  // כתובת שהשרת דוחה, והמשתמש מקבל שגיאה בלי להבין למה.
  const email = cleanEmail(body.email)
  const invalid = emailError(email)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה' }, { status: 500 })

  // ⚠️ insert רגיל ולא upsert: ה-upsert דרש onConflict:'email', ובלי
  // אינדקס ייחודי על העמודה Postgres זורק 42P10 — וזה בדיוק מה שקרה
  // כאן. *כל* הרשמה נכשלה מיום הקמת המחלקה והטבלה נותרה ריקה.
  //
  // 🔴 השורש תוקן במיגרציה 20260923_book_fair_reminders_unique, אבל
  // insert + טיפול ב-23505 עמיד יותר: הוא נשען על הכפילות עצמה ולא על
  // שם האילוץ, ולכן אינו יכול להישבר שוב באותה צורה השקטה.
  const { error } = await db.from('book_fair_reminders').insert({ email })

  if (error) {
    // ⚠️ 23505 = כבר קיים. זו הצלחה מבחינת המשתמש: אין שום סיבה לספר
    // לו שהוא כבר ברשימה — זה רק מבלבל, והתוצאה מבחינתו זהה.
    if (error.code !== '23505') {
      console.error('[fair/remind] insert failed:', error)
      return NextResponse.json({ error: 'הרישום נכשל, נסו שוב' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
