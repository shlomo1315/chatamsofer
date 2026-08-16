import { NextResponse, type NextRequest } from 'next/server'
import { PORTAL_COOKIE, revokePortalToken } from '@/lib/loansPortalAuth'

export async function POST(req: NextRequest) {
  // ⚠️ הסשן מנותק במסד ולא רק בעוגייה: מחיקת עוגייה בדפדפן אחד אינה
  // מונעת שימוש חוזר באותה מחרוזת ממקום אחר. עכשיו הטוקן פסול לצמיתות.
  await revokePortalToken(req.cookies.get(PORTAL_COOKIE)?.value)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  return res
}
