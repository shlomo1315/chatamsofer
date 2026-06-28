// שליחת קוד אימות חד-פעמי למייל או לטלפון (ברישום ובעריכת פרטים).
// הקוד נשמר ב-app_settings תחת המפתח verify:<channel>:<value> (hash + תוקף + ניסיונות).
// טלפון — קוד מוקרא בשיחת ימות (placeCodeCall). מייל — נשלח בדואר.
import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { generateCode, hashCode } from '@/lib/portalPassword'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { placeCodeCall, yemotCallConfigured } from '@/lib/yemotCall'
import { normalizeVerifyValue, type VerifyChannel } from '@/lib/verifyToken'

export const dynamic = 'force-dynamic'

const CODE_TTL_MS = 10 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function codeEmailHtml(code: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"/></head>
  <body style="direction:rtl;text-align:right;font-family:Arial,sans-serif;background:#f1f5f9;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#4f46e5;color:#fff;padding:20px 24px;font-size:18px;font-weight:700;">היכל החתם סופר — אימות כתובת מייל</div>
      <div style="padding:24px;color:#1e293b;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 12px;">קוד האימות לכתובת המייל שלך:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#4f46e5;text-align:center;background:#eef2ff;border-radius:12px;padding:16px 0;margin:8px 0 16px;">${code}</div>
        <p style="margin:0 0 8px;">הקוד תקף ל-<strong>10 דקות</strong>.</p>
        <p style="margin:0 0 12px;color:#64748b;font-size:13px;">אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.</p>
      </div>
      <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;text-align:center;">מייל זה נשלח ממערכת אוטומטית, אין להשיב למייל זה.</p>
      </div>
    </div>
  </body></html>`
}

export async function POST(request: NextRequest) {
  let body: { channel?: string; value?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const channel = body.channel === 'phone' ? 'phone' : body.channel === 'email' ? 'email' : null
  const raw = String(body.value ?? '').trim()
  if (!channel || !raw) return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })

  if (channel === 'email' && !EMAIL_RE.test(raw)) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }
  const value = normalizeVerifyValue(channel as VerifyChannel, raw)
  if (channel === 'phone' && value.replace(/\D/g, '').length < 9) {
    return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 })
  }

  // הגבלת קצב: לפי IP+ערך (טלפון מחמיר יותר כי שיחה עולה)
  const ip = clientIp(request)
  const perValue = channel === 'phone' ? 4 : 5
  if (!rateLimit(`verify-send:${channel}:${value}`, perValue, 15 * 60 * 1000) ||
      !rateLimit(`verify-send-ip:${ip}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  if (channel === 'phone' && !yemotCallConfigured()) {
    return NextResponse.json({ error: 'אימות טלפוני אינו זמין כעת. אנא נסו שוב מאוחר יותר.' }, { status: 503 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const code = generateCode()
  const hash = await hashCode(code)
  const record = JSON.stringify({ hash, expires: Date.now() + CODE_TTL_MS, attempts: 0 })
  const key = `verify:${channel}:${value}`
  const { error: upErr } = await admin.from('app_settings').upsert(
    { key, value: record, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  if (upErr) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  if (channel === 'email') {
    deliverMail(raw, 'קוד אימות כתובת מייל — היכל החתם סופר', codeEmailHtml(code), undefined, { ...mailFor('igud'), skipLog: true })
      .catch((e) => console.error('[verify/send] email failed:', e))
  } else {
    const r = await placeCodeCall(raw, code)
    if (!r.ok && !r.notConfigured) console.error('[verify/send] call failed:', r.error)
  }

  return NextResponse.json({ ok: true, sent: true })
}
