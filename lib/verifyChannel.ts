// לוגיקה משותפת לשליחה ואימות של קוד חד-פעמי (מייל/טלפון).
// מקור-אמת יחיד עבור:
//   - app/api/portal/verify/send + confirm (הפורטל הציבורי)
//   - app/api/nedarim-form/verify/send + confirm (טופס נדרים, טלפון בלבד)
// כל route עוטף את התוצאה בתגובת HTTP משלו (עם/בלי CORS).
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { generateCode, hashCode, verifyCode } from '@/lib/portalPassword'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { placeCodeCall, yemotCallConfigured } from '@/lib/yemotCall'
import { createVerifyToken, normalizeVerifyValue, type VerifyChannel } from '@/lib/verifyToken'
import { verifyCodeEmail } from '@/lib/emailTemplates'

const CODE_TTL_MS = 10 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// תוצאה ניטרלית ל-HTTP: ה-route ממיר ל-NextResponse (עם/בלי CORS).
export interface ChannelResult {
  status: number
  body: Record<string, unknown>
}

// נרמול הערוץ מקלט גולמי. מחזיר null אם לא תקין.
export function parseChannel(raw: unknown): VerifyChannel | null {
  return raw === 'phone' ? 'phone' : raw === 'email' ? 'email' : null
}

// שליחת קוד אימות. הלוגיקה זהה למקור (portal/verify/send) — מחולצת לשיתוף.
export async function sendVerifyCode(
  request: Request,
  channel: VerifyChannel,
  rawValue: string,
): Promise<ChannelResult> {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return { status: 400, body: { error: 'חסרים פרטים' } }

  if (channel === 'email' && !EMAIL_RE.test(raw)) {
    return { status: 400, body: { error: 'כתובת מייל לא תקינה' } }
  }
  const value = normalizeVerifyValue(channel, raw)
  if (channel === 'phone' && value.replace(/\D/g, '').length < 9) {
    return { status: 400, body: { error: 'מספר טלפון לא תקין' } }
  }

  // הגבלת קצב: לפי IP+ערך (טלפון מחמיר יותר כי שיחה עולה)
  const ip = clientIp(request)
  const perValue = channel === 'phone' ? 4 : 5
  if (!rateLimit(`verify-send:${channel}:${value}`, perValue, 15 * 60 * 1000) ||
      !rateLimit(`verify-send-ip:${ip}`, 20, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

  // תקרה גלובלית מוחלטת על סך השליחות בערוץ — בולמת call/email-bombing
  // כשתוקף מסובב מספרים/כתובות ו-IP-ים. כל שיחת ימות עולה כסף.
  const globalCap = channel === 'phone' ? 60 : 200
  if (!rateLimit(`verify-send-global:${channel}`, globalCap, 15 * 60 * 1000)) {
    console.error(`[verify/send] global ${channel} cap hit — possible flooding attack`)
    return { status: 429, body: { error: 'השירות עמוס כעת. אנא נסו שוב מאוחר יותר.' } }
  }

  if (channel === 'phone' && !yemotCallConfigured()) {
    return { status: 503, body: { error: 'אימות טלפוני אינו זמין כעת. אנא נסו שוב מאוחר יותר.' } }
  }

  const admin = getServiceClient()
  if (!admin) return { status: 500, body: { error: 'שגיאת שרת' } }

  const code = generateCode()
  const hash = await hashCode(code)
  const record = JSON.stringify({ hash, expires: Date.now() + CODE_TTL_MS, attempts: 0 })
  const key = `verify:${channel}:${value}`
  const { error: upErr } = await admin.from('app_settings').upsert(
    { key, value: record, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  if (upErr) return { status: 500, body: { error: 'שגיאת שרת' } }

  if (channel === 'email') {
    const mail = verifyCodeEmail(code)
    const res = await deliverMail(raw, mail.subject, mail.html, undefined, { ...mailFor('igud'), skipLog: true })
    if (!res || !res.ok) {
      console.error('[verify/send] email failed:', res?.error)
      return { status: 502, body: { error: 'שליחת המייל נכשלה. נסו שוב או פנו למזכירות.' } }
    }
  } else {
    const r = await placeCodeCall(raw, code)
    // ⚠️ כשל בשיחה החזיר עד כה ok:true — המשתמש ראה "מתקשרים אליך כעת"
    // בזמן שהחיוג נכשל, ונשאר להמתין לשיחה שלא תגיע. מדווחים במפורש.
    if (!r.ok && !r.notConfigured) {
      console.error('[verify/send] call failed:', r.error)
      return {
        status: 502,
        body: { error: 'החיוג נכשל. נסו שוב, או בחרו אימות במייל.' },
      }
    }
  }

  return { status: 200, body: { ok: true, sent: true } }
}

// אימות קוד. בהצלחה מחזיר טוקן חתום. הלוגיקה זהה למקור (portal/verify/confirm).
export async function confirmVerifyCode(
  request: Request,
  channel: VerifyChannel,
  rawValue: string,
  rawCode: string,
): Promise<ChannelResult> {
  const raw = String(rawValue ?? '').trim()
  const code = String(rawCode ?? '').replace(/\D/g, '')
  if (!raw || !code) return { status: 400, body: { error: 'חסרים פרטים' } }

  if (!rateLimit(`verify-confirm-ip:${clientIp(request)}`, 30, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

  const value = normalizeVerifyValue(channel, raw)
  const admin = getServiceClient()
  if (!admin) return { status: 500, body: { error: 'שגיאת שרת' } }

  const key = `verify:${channel}:${value}`
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return { status: 400, body: { error: 'לא נמצא קוד פעיל. שלחו קוד חדש.' } }

  let rec: { hash?: string; expires?: number; attempts?: number }
  try { rec = JSON.parse(data.value) } catch { return { status: 400, body: { error: 'קוד לא תקין. שלחו קוד חדש.' } } }

  if (!rec.expires || Date.now() > rec.expires) {
    await admin.from('app_settings').delete().eq('key', key)
    return { status: 400, body: { error: 'הקוד פג תוקף. שלחו קוד חדש.' } }
  }
  if ((rec.attempts ?? 0) >= 5) {
    await admin.from('app_settings').delete().eq('key', key)
    return { status: 400, body: { error: 'יותר מדי ניסיונות שגויים. שלחו קוד חדש.' } }
  }

  const ok = await verifyCode(code, rec.hash)
  if (!ok) {
    await admin.from('app_settings').upsert(
      { key, value: JSON.stringify({ ...rec, attempts: (rec.attempts ?? 0) + 1 }), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    return { status: 400, body: { error: 'קוד שגוי. נסו שוב.' } }
  }

  await admin.from('app_settings').delete().eq('key', key)
  return { status: 200, body: { ok: true, token: createVerifyToken(channel, raw) } }
}
