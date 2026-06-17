import { NextResponse } from 'next/server'
import { PORTAL_COOKIE } from '@/lib/loansPortalAuth'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
  return res
}
