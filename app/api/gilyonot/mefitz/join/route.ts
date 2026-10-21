import { NextResponse } from 'next/server'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { submitJoinRequest, validateJoinRequest } from '@/lib/gilyonotDistributorJoin'

// טופס ההצטרפות הציבורי למערך המפיצים (/gilyonot/mefitz/join).
// ⚠️ ציבורי בלי התחברות, ויכול רק להגיש בקשה ממתינה: הגבלת קצב לפי IP, שדה מלכודת
// לבוטים ואימות מלא כאן בשרת. טלפון של מפיץ קיים מקבל הודעה כללית, בלי שם.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ip = clientIpOrNull(request) ?? 'unknown'
  if (!rateLimit(`gilyonot-join:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const v = validateJoinRequest(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const res = await submitJoinRequest(db, v.value)
  if (!res.ok) return NextResponse.json({ error: res.error, code: res.code }, { status: res.code === 'failed' ? 500 : 409 })
  return NextResponse.json({ ok: true })
}
