import { NextResponse } from 'next/server'
import { MM_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/matchmaker/crypto'
import { JSON_HEADERS } from '@/lib/matchmaker/session'

export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: JSON_HEADERS })
  res.cookies.set(MM_COOKIE, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 })
  return res
}
