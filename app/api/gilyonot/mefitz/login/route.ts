import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { rateLimit, clientIpOrNull } from '@/lib/rateLimit'
import { deliverMail } from '@/lib/sendMail'
import { placeCodeCall } from '@/lib/yemotCall'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME, normalizeEmail } from '@/lib/gilyonot'
import { distributorMailHtml } from '@/lib/gilyonotDistributorServer'
import {
  CODE_TTL_MIN, DISTRIBUTOR_COOKIE, createSessionToken, issueLoginCode, identityFilter, parseLogin,
  sessionCookieOptions, verifyLoginCode,
} from '@/lib/gilyonotDistributorAuth'

// כניסת מפיץ (/gilyonot/mefitz): בקשת קוד חד-פעמי, אימות שלו, והתנתקות.
// ⚠️ ציבורי: הגבלת קצב לפי IP ולפי מזהה, והתשובה לבקשת קוד זהה גם כשהמזהה לא
// רשום — כדי שאי אפשר יהיה לבדוק דרך הטופס מי מפיץ.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const GENERIC = 'אם הפרטים רשומים במערך המפיצים, נשלח עכשיו קוד כניסה למייל הרשום, או בשיחה טלפונית.'

// POST { step: 'request', id } | { step: 'verify', id, code }
export async function POST(request: Request) {
  const ip = clientIpOrNull(request) ?? 'unknown'
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const id = parseLogin(body.id)
  if (!id) return NextResponse.json({ error: 'הפרטים שהוזנו אינם תקינים' }, { status: 400 })
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  if (body.step === 'request') {
    if (!rateLimit(`mefitz-code:${ip}`, 8, 15 * 60_000)) {
      return NextResponse.json({ error: 'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.' }, { status: 429 })
    }
    const { data: rows } = await db.from('gilyonot_distributors').select('email, phone').eq('status', 'active').or(identityFilter(id)).limit(20)
    if (!rows?.length) return NextResponse.json({ ok: true, message: GENERIC })

    const email = rows.map(r => normalizeEmail(r.email)).find(Boolean) ?? null
    const phone = id.by === 'phone' ? id.value : rows.find(r => r.phone)?.phone ?? null
    if (!email && !phone) return NextResponse.json({ ok: true, message: GENERIC })

    const issued = await issueLoginCode(db, id)
    if (!issued.ok) return NextResponse.json({ error: issued.error }, { status: 429 })

    let sent = false
    if (email) {
      const html = distributorMailHtml('קוד כניסה לממשק המפיצים', `קוד הכניסה שלך הוא: ${issued.code}\n\nהקוד תקף ל-${CODE_TTL_MIN} דקות. אם לא ביקשת אותו, אפשר להתעלם מההודעה.`)
      const r = await deliverMail(email, `קוד כניסה: ${issued.code}`, html, undefined, { transactional: true, gmailPriority: 'high', fromName: GILYONOT_FROM_NAME, fromEmail: GILYONOT_FROM_EMAIL })
      sent = r.ok
      if (!r.ok) console.error('[mefitz] code mail failed:', r.error)
    }
    if (!sent && phone) {
      const r = await placeCodeCall(phone, issued.code)
      sent = r.ok
      if (!r.ok) console.error('[mefitz] code call failed:', r.notConfigured ? 'not configured' : r.error)
    }
    if (!sent) return NextResponse.json({ error: 'שליחת הקוד נכשלה. נסו שוב בעוד כמה דקות, או פנו למשרד.' }, { status: 502 })
    return NextResponse.json({ ok: true, message: GENERIC })
  }

  if (body.step === 'verify') {
    if (!rateLimit(`mefitz-verify:${ip}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' }, { status: 429 })
    }
    const code = String(body.code ?? '').replace(/\D/g, '')
    if (!(await verifyLoginCode(db, id, code))) return NextResponse.json({ error: 'הקוד שגוי או שפג תוקפו' }, { status: 401 })
    const token = createSessionToken(id)
    if (!token) return serverMisconfigured()
    ;(await cookies()).set(DISTRIBUTOR_COOKIE, token, sessionCookieOptions)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
}

// DELETE — יציאה מהממשק (לא התנתקות מהמערך)
export async function DELETE() {
  ;(await cookies()).delete(DISTRIBUTOR_COOKIE)
  return NextResponse.json({ ok: true })
}
