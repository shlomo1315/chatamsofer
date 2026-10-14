import { NextResponse } from 'next/server'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { cleanName, normalizePhone, validateLines } from '@/lib/kvitel'
import { ingestKvitel } from '@/lib/kvitelIngest'

// טופס הקוויטל הציבורי (/kvitel) — ערוץ "לינק".
// ⚠️ ציבורי בלי התחברות: הגבלת קצב לפי IP, שדה מלכודת לבוטים, וכל שדה עובר
// ניקוי ואימות כאן בשרת (lib/kvitel) — מה שהדפדפן שלח אינו נאמן.
export async function POST(request: Request) {
  const ip = clientIpOrNull(request) ?? 'unknown'
  if (!rateLimit(`kvitel:${ip}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  // מלכודת: שדה מוסתר שאדם לא ממלא. עונים "התקבל" כדי לא ללמד את הבוט.
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const contactName = cleanName(body.contactName)
  const phone = normalizePhone(body.phone)
  if (!contactName) return NextResponse.json({ error: 'יש למלא את שם המגיש' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'מספר הטלפון אינו תקין' }, { status: 400 })

  const v = validateLines(body.lines)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const res = await ingestKvitel(db, { channel: 'web', phone, contactName, lines: v.lines })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
