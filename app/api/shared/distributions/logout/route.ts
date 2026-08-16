import { NextResponse, type NextRequest } from 'next/server'
import { DIST_PORTAL_COOKIE, revokePortalToken } from '@/lib/distributionsPortalAuth'

export async function POST(req: NextRequest) {
  // ⚠️ הסשן מנותק במסד ולא רק בעוגייה — ראו ההערה במסלול המקביל בהלוואות.
  await revokePortalToken(req.cookies.get(DIST_PORTAL_COOKIE)?.value)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(DIST_PORTAL_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  return res
}
