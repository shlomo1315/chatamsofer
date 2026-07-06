import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

// ניתוק כל סשני פורטל בתי ההחלמה שנפתחו מתוך המערכת (כניסה מהירה של הצוות).
// נקרא בעת התנתקות הצוות מהמערכת — כך שגישת ה"כניסה המהירה" מתנתקת יחד עם הצוות.
// עוגיות הפורטל נושאות קידומת 'ph_' (ראה portalCookieName).
export async function POST() {
  const cookieStore = await cookies()
  const res = NextResponse.json({ ok: true })
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('ph_')) {
      res.cookies.set(c.name, '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: '/' })
    }
  }
  return res
}
