import { NextResponse } from 'next/server'
import { DIST_PORTAL_COOKIE } from '@/lib/distributionsPortalAuth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(DIST_PORTAL_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  return res
}
