// אסימון אימות חתום (HMAC) המוכיח שכתובת מייל / מספר טלפון אומתו בקוד חד-פעמי.
// משמש גם ברישום (לפני שיש חשבון) וגם בעריכת פרטים בדשבורד. תקף 30 דקות.
import { normalizePhone } from './phone'
import { signPayload, verifySignature } from '@/lib/signedToken'

const TTL_MS = 30 * 60 * 1000

export type VerifyChannel = 'email' | 'phone'

// נרמול אחיד של הערך לפי הערוץ (מייל באותיות קטנות; טלפון לספרות בלבד)
export function normalizeVerifyValue(channel: VerifyChannel, value: string): string {
  if (channel === 'phone') return normalizePhone(value)
  return String(value ?? '').trim().toLowerCase()
}

// יוצר אסימון לאחר אימות מוצלח: "<channel>:<value>:<exp>.<hmac>"
// ⚠️ מחרוזת ריקה = אין סוד חתימה, ולכן אין אסימון (ראו lib/signedToken).
export function createVerifyToken(channel: VerifyChannel, value: string): string {
  const v = normalizeVerifyValue(channel, value)
  const exp = Date.now() + TTL_MS
  const payload = `${channel}:${v}:${exp}`
  const sig = signPayload(payload, 'base64url')
  if (!sig) return ''
  return `${payload}.${sig}`
}

// מאמת שהאסימון תקף, לא פג, ותואם בדיוק לערוץ ולערך שנמסרים.
export function verifyVerifyToken(token: string | undefined | null, channel: VerifyChannel, value: string): boolean {
  if (!token || typeof token !== 'string') return false
  const dot = token.lastIndexOf('.')
  if (dot < 0) return false
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!verifySignature(payload, mac, 'base64url')) return false
  const parts = payload.split(':')
  if (parts.length !== 3) return false
  const [c, v, expStr] = parts
  if (c !== channel) return false
  if (v !== normalizeVerifyValue(channel, value)) return false
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  return true
}
