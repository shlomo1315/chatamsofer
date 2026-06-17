import { NextResponse } from 'next/server'
import { verifyPortalPassword, issuePortalToken, PORTAL_COOKIE } from '@/lib/loansPortalAuth'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()
    if (!password) return NextResponse.json({ error: 'חסרה סיסמה' }, { status: 400 })

    const ok = await verifyPortalPassword(String(password))
    if (!ok) return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401 })

    const token = issuePortalToken()
    const res = NextResponse.json({ ok: true })
    res.cookies.set(PORTAL_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'שגיאה פנימית' }, { status: 500 })
  }
}
