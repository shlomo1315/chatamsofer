import { type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { jsonCors, preflight } from '@/lib/cors'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { safeEqual } from '@/lib/svix'
import { ingestKvitel } from '@/lib/kvitelIngest'
import { parseNedarimKvitel } from '@/lib/kvitelNedarim'

// ─────────────────────────────────────────────────────────────────────────────
// קוויטלאך מנדרים פלוס — הטופס החינמי של נדרים שולח לכאן כל הגשה (ערוץ "nedarim").
// מקבל JSON או form, מכל שיטה שנדרים תומכים בה (POST, או GET עם query).
//
// ⚠️ ציבורי כמו טופס הלינק: הגבלת קצב, מלכודת, ניקוי ואימות בשרת.
// אם מוגדר סוד משותף (KVITEL_NEDARIM_TOKEN), נדרש ?token= תואם — מומלץ ברגע
// שנדרים יגדירו את כתובת ה-callback.
// כפילות (נדרים שולחים שוב) נמנעת לפי מזהה ההגשה (TransactionId).
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
  if (!rateLimit(`kvitel-nedarim:${ip}`, 30, 10 * 60_000)) {
    return jsonCors({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 }, origin)
  }

  const secret = process.env.KVITEL_NEDARIM_TOKEN
  const body = await readBody(request)
  if (secret && !safeEqual(String(body.token ?? ''), secret)) return jsonCors({ error: 'אין הרשאה' }, { status: 401 }, origin)
  delete body.token
  if (typeof body.website === 'string' && body.website.trim()) return jsonCors({ ok: true }, { status: 200 }, origin)

  const p = parseNedarimKvitel(body)
  if (!p.lines.length && !p.freeText) return jsonCors({ error: 'לא התקבלו שמות' }, { status: 400 }, origin)

  const db = getServiceClient()
  if (!db) return jsonCors({ error: 'שגיאת שרת' }, { status: 500 }, origin)
  const res = await ingestKvitel(db, {
    channel: 'nedarim', phone: p.phone, email: p.email, contactName: p.contactName,
    lines: p.lines, lineFlags: p.flags, rawText: p.rawText, sourceRef: p.sourceRef,
  })
  if (!res.ok) return jsonCors({ error: 'השמירה נכשלה. נסו שוב.' }, { status: 500 }, origin)
  return jsonCors({ ok: true, lines: p.lines.length }, { status: 200 }, origin)
}

export const POST = handle
export const GET = handle
