import { NextResponse } from 'next/server'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { normalizeEmail, cleanSubscriberName, subscribeGilyonot } from '@/lib/gilyonot'

// טופס ההרשמה הציבורי לגיליון השבועי (/gilyonot).
// ⚠️ ציבורי בלי התחברות: הגבלת קצב לפי IP, שדה מלכודת לבוטים, ואימות המייל
// והאישור כאן בשרת. התשובה זהה גם כשהמייל כבר רשום, כדי לא לחשוף מי ברשימה.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ip = clientIpOrNull(request) ?? 'unknown'
  if (!rateLimit(`gilyonot:${ip}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const email = normalizeEmail(body.email)
  if (!email) return NextResponse.json({ error: 'נא להזין כתובת מייל תקינה' }, { status: 400 })
  if (body.consent !== true) return NextResponse.json({ error: 'יש לסמן את האישור לקבלת הגיליון במייל' }, { status: 400 })

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const res = await subscribeGilyonot(db, { email, name: cleanSubscriberName(body.name), source: 'web' })
  if (!res.ok) return NextResponse.json({ error: 'ההרשמה נכשלה. נסו שוב.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
