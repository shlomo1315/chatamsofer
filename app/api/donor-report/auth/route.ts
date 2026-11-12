import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { resolveDonorLink } from '@/lib/donorReport'
import { checkDonorPassword, issueDonorSession, DONOR_COOKIE, DONOR_SESSION_HOURS } from '@/lib/donorReportAuth'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

// כניסה לקישור הנדיב עם סיסמה. מגבלה: 5 ניסיונות ל-15 דקות לכל קישור ו-IP,
// ועוד תקרה כללית לקישור כדי לבלום ניחוש מכמה כתובות.
export async function POST(request: NextRequest) {
  let body: { t?: string; password?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: HEADERS }) }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: HEADERS })

  const link = await resolveDonorLink(db, body.t)
  if (!link) return NextResponse.json({ error: 'הקישור אינו תקין או שבוטל' }, { status: 404, headers: HEADERS })
  if (!link.password_hash) {
    return NextResponse.json({ error: 'הקישור טרם הופעל. פנו למשרד לקבלת סיסמה.' }, { status: 403, headers: HEADERS })
  }

  if (!rateLimit(`donor-auth:${link.id}:${clientIp(request)}`, 5, 15 * 60_000) || !rateLimit(`donor-auth:${link.id}`, 30, 15 * 60_000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' }, { status: 429, headers: { ...HEADERS, 'Retry-After': '900' } })
  }

  if (!(await checkDonorPassword(body.password, link.password_hash))) {
    return NextResponse.json({ error: 'סיסמה שגויה' }, { status: 401, headers: HEADERS })
  }

  const res = NextResponse.json({ ok: true }, { headers: HEADERS })
  res.cookies.set(DONOR_COOKIE, issueDonorSession(link.id, link.password_hash), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/api/donor-report', maxAge: DONOR_SESSION_HOURS * 3600,
  })
  return res
}
