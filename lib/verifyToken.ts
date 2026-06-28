// אסימון אימות חתום (HMAC) המוכיח שכתובת מייל / מספר טלפון אומתו בקוד חד-פעמי.
// משמש גם ברישום (לפני שיש חשבון) וגם בעריכת פרטים בדשבורד. תקף 30 דקות.
import { createHmac, timingSafeEqual } from 'crypto'
import { normalizePhone } from './phone'

const TTL_MS = 30 * 60 * 1000

function secret(): string {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'change-this-secret-in-production'
}

export type VerifyChannel = 'email' | 'phone'

// נרמול אחיד של הערך לפי הערוץ (מייל באותיות קטנות; טלפון לספרות בלבד)
export function normalizeVerifyValue(channel: VerifyChannel, value: string): string {
  if (channel === 'phone') return normalizePhone(value)
  return String(value ?? '').trim().toLowerCase()
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

// יוצר אסימון לאחר אימות מוצלח: "<channel>:<value>:<exp>.<hmac>"
export function createVerifyToken(channel: VerifyChannel, value: string): string {
  const v = normalizeVerifyValue(channel, value)
  const exp = Date.now() + TTL_MS
  const payload = `${channel}:${v}:${exp}`
  return `${payload}.${sign(payload)}`
}

// מאמת שהאסימון תקף, לא פג, ותואם בדיוק לערוץ ולערך שנמסרים.
export function verifyVerifyToken(token: string | undefined | null, channel: VerifyChannel, value: string): boolean {
  if (!token || typeof token !== 'string') return false
  const dot = token.lastIndexOf('.')
  if (dot < 0) return false
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = sign(payload)
  try {
    const a = Buffer.from(mac)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  } catch { return false }
  const parts = payload.split(':')
  if (parts.length !== 3) return false
  const [c, v, expStr] = parts
  if (c !== channel) return false
  if (v !== normalizeVerifyValue(channel, value)) return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  return true
}
