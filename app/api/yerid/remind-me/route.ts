import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// הרשמה לתזכורת פתיחת היריד.
//
// ⚠️ נתיב ציבורי לחלוטין — הוא מוצג בדף ההמתנה למי שאינו מחובר.
// ההגנות: rate limit לפי IP, ולידציית כתובת, ואורך מרבי. אין כאן שום
// נתון רגיש; הסיכון היחיד הוא הצפה, וזה מה שה-rate limit מכסה.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** ⚠️ מכוונת-רחבה: תפקידה לתפוס שגיאת הקלדה, לא לאמת קיום תיבה. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(request: NextRequest) {
  const ip = clientIp(request)
  // 5 הרשמות ל-10 דקות: אדם אחד נרשם פעם אחת, וזה מרווח בשפע גם
  // למשפחה שלמה מאותו חיבור.
  if (!rateLimit(`fair-remind:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'נסו שוב בעוד כמה דקות' }, { status: 429 })
  }

  let body: { email?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // ⚠️ ניקוי תווי כיווניות בלתי נראים — מגיעים מהדבקה ושוברים גם את
  // הוולידציה וגם את השליחה בפועל. תקלה חוזרת במערכת.
  const email = String(body.email ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .trim()
    .toLowerCase()

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת תצורה' }, { status: 500 })

  // ⚠️ upsert ולא insert: מי שנרשם פעמיים מקבל את אותה תשובה חיובית
  // במקום שגיאת כפילות. אין שום סיבה לספר לו שהוא כבר ברשימה — זה
  // רק מבלבל, והתוצאה מבחינתו זהה.
  const { error } = await db.from('book_fair_reminders')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })

  if (error) {
    // ⚠️ 23505 = כבר קיים. זו הצלחה מבחינת המשתמש.
    if (error.code !== '23505') {
      console.error('[fair/remind] insert failed:', error)
      return NextResponse.json({ error: 'הרישום נכשל, נסו שוב' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
