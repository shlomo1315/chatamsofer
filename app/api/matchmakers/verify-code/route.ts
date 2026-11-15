import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { normalizeEmail } from '@/lib/matchmaker/validate'
import { consumeLoginCode } from '@/lib/matchmaker/loginCode'
import { MM_COOKIE, SESSION_COOKIE_OPTIONS, issueSession } from '@/lib/matchmaker/crypto'
import { JSON_HEADERS } from '@/lib/matchmaker/session'
import { sendWelcomeRegistered } from '@/lib/matchmaker/mail'

export const dynamic = 'force-dynamic'

const BAD = 'הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.'

export async function POST(request: NextRequest) {
  let body: { email?: string; code?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: JSON_HEADERS }) }
  const email = normalizeEmail(body.email)
  const code = String(body.code ?? '').replace(/\s/g, '')
  if (!email || !/^\d{6}$/.test(code)) return NextResponse.json({ error: BAD }, { status: 400, headers: JSON_HEADERS })

  if (!rateLimit(`mm-verify-ip:${clientIp(request) ?? 'unknown'}`, 20, 15 * 60_000) || !rateLimit(`mm-verify-mail:${email}`, 15, 15 * 60_000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' }, { status: 429, headers: { ...JSON_HEADERS, 'Retry-After': '900' } })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })

  const { data: m } = await db.from('matchmakers').select('id, first_name, email, status, email_verified_at, welcome_sent_at').eq('email_norm', email).maybeSingle()
  if (!m || m.status !== 'active' || !(await consumeLoginCode(db, m.id, code))) {
    return NextResponse.json({ error: BAD }, { status: 401, headers: JSON_HEADERS })
  }
  const now = new Date().toISOString()
  await db.from('matchmakers').update({ last_login_at: now, ...(m.email_verified_at ? {} : { email_verified_at: now }) }).eq('id', m.id)
  // מייל "נרשמתם בהצלחה" פעם אחת, אחרי האימות הראשון. סימון קודם לשליחה כדי שלא יישלח פעמיים במרוץ
  if (!m.welcome_sent_at) {
    const { data: marked } = await db.from('matchmakers').update({ welcome_sent_at: now }).eq('id', m.id).is('welcome_sent_at', null).select('id')
    if (marked?.length) {
      const sent = await sendWelcomeRegistered(m.email, m.first_name).catch(() => null)
      if (!sent) await db.from('matchmakers').update({ welcome_sent_at: null }).eq('id', m.id)
    }
  }
  const res = NextResponse.json({ ok: true }, { headers: JSON_HEADERS })
  res.cookies.set(MM_COOKIE, issueSession(m.id), SESSION_COOKIE_OPTIONS)
  return res
}
