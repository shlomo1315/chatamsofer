import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { portalCookieName } from '@/app/api/portal/login/route'
import { createRecoveryPortalToken, RECOVERY_PORTAL_MAX_AGE } from '@/lib/recoveryPortalAuth'

export const dynamic = 'force-dynamic'

// כניסה מהירה לפורטל בית ההחלמה עבור צוות מחובר (מנהל/מזכירות) — ללא סיסמה.
// מגדיר את עוגיית הפורטל ומפנה ישירות לעמוד הפורטל. העוגייה זהה לזו של התחברות
// רגילה, כך שהיא מתנתקת אוטומטית עם התנתקות הצוות (ראה portal-logout-all).
export async function GET(request: NextRequest) {
  const home = request.nextUrl.searchParams.get('home')
  // מאחורי proxy (Railway) ה-origin הפנימי הוא localhost — משתמשים בכתובת הציבורית
  // המוגדרת, בעקביות עם שאר המערכת, ורק כ-fallback ב-origin.
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  ).replace(/\/$/, '')

  const staff = await requireStaff()
  if (!staff) {
    // לא מחובר כצוות — להפניה לכניסת הניהול
    return NextResponse.redirect(new URL('/login', origin))
  }
  if (!home) {
    return NextResponse.redirect(new URL('/admin/maternity/recovery', origin))
  }

  // בתי החלמה מברירת-מחדל מוזרקים לתצוגה גם בלי שורה ב-DB. אם חסרה שורה —
  // צור אותה כדי שהכניסה המהירה תעבוד, במקום להפנות חזרה בשקט.
  const DEFAULT_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']
  const admin = getServiceClient()
  if (admin) {
    const { data } = await admin.from('recovery_homes').select('name').eq('name', home).maybeSingle()
    if (!data) {
      if (DEFAULT_HOMES.includes(home)) {
        await admin.from('recovery_homes').upsert({ name: home }, { onConflict: 'name' })
      } else {
        return NextResponse.redirect(
          new URL('/admin/maternity/recovery?portalError=' + encodeURIComponent('בית החלמה לא נמצא במערכת'), origin),
        )
      }
    }
  }

  const res = NextResponse.redirect(new URL(`/portal/maternity/${encodeURIComponent(home)}`, origin))
  res.cookies.set(portalCookieName(home), createRecoveryPortalToken(home), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: RECOVERY_PORTAL_MAX_AGE,
    path: '/',
  })
  return res
}
