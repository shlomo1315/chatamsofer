import { NextResponse } from 'next/server'
import { verifyPortalPassword, issuePortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { clientIp } from '@/lib/rateLimit'
import { guardedPasswordCheck } from '@/lib/portalLoginLock'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()
    if (!password) return NextResponse.json({ error: 'חסרה סיסמה' }, { status: 400 })

    // נעילה לפי IP במסד: 3 ניסיונות, חסימה ל-3 שעות ואז ל-24 שעות (lib/portalLoginLock)
    const denied = await guardedPasswordCheck('loans-auth', clientIp(req), () => verifyPortalPassword(String(password)))
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })

    // ⚠️ מזוהה ל-portal_sessions כדי שהמנהל יוכל לזהות מכשיר ולנתק אותו
    // נקודתית. לא מזהה ודאי — עזר תפעולי בלבד.
    const token = await issuePortalToken({
      userAgent: req.headers.get('user-agent'),
      ip: clientIp(req),
    })
    const res = NextResponse.json({ ok: true })
    res.cookies.set(PORTAL_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית' }, { status: 500 })
  }
}
