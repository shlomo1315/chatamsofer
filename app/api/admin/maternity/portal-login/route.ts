import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { portalCookieName } from '@/app/api/portal/login/route'

export const dynamic = 'force-dynamic'

// כניסה מהירה לפורטל בית ההחלמה עבור צוות מחובר (מנהל/מזכירות) — ללא סיסמה.
// מגדיר את עוגיית הפורטל ומפנה ישירות לעמוד הפורטל. העוגייה זהה לזו של התחברות
// רגילה, כך שהיא מתנתקת אוטומטית עם התנתקות הצוות (ראה portal-logout-all).
export async function GET(request: NextRequest) {
  const home = request.nextUrl.searchParams.get('home')
  const origin = request.nextUrl.origin

  const staff = await requireStaff()
  if (!staff) {
    // לא מחובר כצוות — להפניה לכניסת הניהול
    return NextResponse.redirect(new URL('/login', origin))
  }
  if (!home) {
    return NextResponse.redirect(new URL('/admin/maternity/recovery', origin))
  }

  // אימות ששם בית ההחלמה קיים במערכת (מונע הזרקת שם שרירותי)
  const admin = getServiceClient()
  if (admin) {
    const { data } = await admin.from('recovery_homes').select('name').eq('name', home).maybeSingle()
    if (!data) {
      return NextResponse.redirect(new URL('/admin/maternity/recovery', origin))
    }
  }

  const res = NextResponse.redirect(new URL(`/portal/maternity/${encodeURIComponent(home)}`, origin))
  res.cookies.set(portalCookieName(home), '1', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })
  return res
}
