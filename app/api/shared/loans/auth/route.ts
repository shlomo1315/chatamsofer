import { NextResponse } from 'next/server'
import { verifyPortalPassword, issuePortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export async function POST(req: Request) {
  try {
    // הגבלת קצב — בולמת ניחוש הסיסמה המשותפת (אין lockout אחר). עקבי עם portal/login.
    if (!rateLimit(`loans-auth:${clientIp(req)}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
    }

    const { password } = await req.json()
    if (!password) return NextResponse.json({ error: 'חסרה סיסמה' }, { status: 400 })

    const ok = await verifyPortalPassword(String(password))
    if (!ok) return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })

    const token = await issuePortalToken()
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
