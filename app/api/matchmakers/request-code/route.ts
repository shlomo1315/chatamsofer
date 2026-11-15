import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { normalizeEmail } from '@/lib/matchmaker/validate'
import { issueLoginCode } from '@/lib/matchmaker/loginCode'
import { JSON_HEADERS } from '@/lib/matchmaker/session'

export const dynamic = 'force-dynamic'

// בקשת קוד כניסה. התשובה זהה בין מייל רשום ללא רשום, כדי שלא ניתן יהיה לגלות מי רשום.
export async function POST(request: NextRequest) {
  let body: { email?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400, headers: JSON_HEADERS }) }
  const email = normalizeEmail(body.email)
  if (!email) return NextResponse.json({ error: 'כתובת המייל אינה תקינה' }, { status: 400, headers: JSON_HEADERS })

  if (!rateLimit(`mm-code-ip:${clientIp(request) ?? 'unknown'}`, 10, 15 * 60_000) || !rateLimit(`mm-code-mail:${email}`, 5, 15 * 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429, headers: { ...JSON_HEADERS, 'Retry-After': '900' } })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500, headers: JSON_HEADERS })

  const { data: m } = await db.from('matchmakers').select('id, first_name, email, status').eq('email_norm', email).maybeSingle()
  if (m && m.status === 'active') await issueLoginCode(db, m)
  return NextResponse.json({ ok: true }, { headers: JSON_HEADERS })
}
