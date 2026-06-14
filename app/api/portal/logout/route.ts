import { NextResponse, type NextRequest } from 'next/server'
import { portalCookieName } from '../login/route'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { home } = await request.json().catch(() => ({}))
  const res = NextResponse.json({ ok: true })
  if (home) res.cookies.set(portalCookieName(home), '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: '/' })
  return res
}
