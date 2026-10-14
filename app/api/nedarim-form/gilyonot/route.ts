import { type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { jsonCors, preflight } from '@/lib/cors'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { safeEqual } from '@/lib/svix'
import { parseNedarimGilyon, subscribeGilyonot } from '@/lib/gilyonot'

// ─────────────────────────────────────────────────────────────────────────────
// טופס "גיליונות" בנדרים פלוס — כל הגשה נכנסת לרשימת התפוצה (מקור "nedarim").
// מקבל JSON או form, ב-POST או ב-GET עם query, כמו הקליטה של הקוויטלאך.
// שדות: שם (ClientName / FullName / Name, או FirstName+LastName) ומייל (Mail / Email).
//
// ⚠️ ציבורי: הגבלת קצב ואימות המייל בשרת. אם מוגדר GILYONOT_NEDARIM_TOKEN,
// נדרש ?token= תואם. מייל שכבר ברשימה לא נכנס שוב (lib/gilyonot decideSubscribe).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = Object.fromEntries(request.nextUrl.searchParams)
  if (request.method !== 'POST') return out
  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('json')) Object.assign(out, await request.json())
    else Object.assign(out, Object.fromEntries((await request.formData()).entries()))
  } catch { /* גוף ריק או שבור — נשארים עם ה-query */ }
  return out
}

async function handle(request: NextRequest) {
  const origin = request.headers.get('origin')
  const ip = clientIpOrNull(request) ?? 'unknown'
  if (!rateLimit(`gilyonot-nedarim:${ip}`, 60, 10 * 60_000)) {
    return jsonCors({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 }, origin)
  }

  const secret = process.env.GILYONOT_NEDARIM_TOKEN
  const body = await readBody(request)
  if (secret && !safeEqual(String(body.token ?? ''), secret)) return jsonCors({ error: 'אין הרשאה' }, { status: 401 }, origin)
  delete body.token

  const p = parseNedarimGilyon(body)
  if (!p.email) return jsonCors({ error: 'כתובת מייל לא תקינה' }, { status: 400 }, origin)

  const db = getServiceClient()
  if (!db) return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)
  const res = await subscribeGilyonot(db, { email: p.email, name: p.name, source: 'nedarim', sourceRef: p.sourceRef })
  if (!res.ok) return jsonCors({ error: 'השמירה נכשלה. נסו שוב.' }, { status: 500 }, origin)
  return jsonCors({ ok: true }, { status: 200 }, origin)
}

export const POST = handle
export const GET = handle
