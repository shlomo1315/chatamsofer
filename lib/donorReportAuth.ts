import bcrypt from 'bcryptjs'
import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// סיסמה לקישור הנדיב. כל קישור עם סיסמה משלו (bcrypt), ואחרי כניסה מוצלחת
// נקבע cookie חתום שקשור לקישור ולסיסמה הנוכחית: החלפת סיסמה או ביטול הקישור
// פוסלים כניסות קודמות. קישור בלי סיסמה אינו מחזיר נתונים בשום מצב.
// ─────────────────────────────────────────────────────────────────────────────

export const DONOR_COOKIE = 'donor_report_session'
export const DONOR_SESSION_HOURS = 12
export const DONOR_MIN_PASSWORD = 6
export const DONOR_MAX_PASSWORD = 100

function secret() {
  return process.env.DONOR_REPORT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function validateDonorPassword(p: unknown): string | null {
  if (typeof p !== 'string' || p.length < DONOR_MIN_PASSWORD) return `הסיסמה חייבת להכיל לפחות ${DONOR_MIN_PASSWORD} תווים`
  if (p.length > DONOR_MAX_PASSWORD) return 'הסיסמה ארוכה מדי'
  return null
}

export function hashDonorPassword(p: string): Promise<string> {
  return bcrypt.hash(p, 12)
}

export async function checkDonorPassword(p: unknown, hash: string | null | undefined): Promise<boolean> {
  if (!hash || typeof p !== 'string' || !p || p.length > DONOR_MAX_PASSWORD) return false
  return bcrypt.compare(p, hash)
}

function sign(linkId: string, exp: number, hash: string) {
  return createHmac('sha256', secret()).update(`${linkId}.${exp}.${hash}`).digest('base64url')
}

export function issueDonorSession(linkId: string, hash: string, now = Date.now()): string {
  const exp = now + DONOR_SESSION_HOURS * 3600_000
  return `${linkId}.${exp}.${sign(linkId, exp, hash)}`
}

export function verifyDonorSession(cookie: string | undefined | null, linkId: string, hash: string | null | undefined, now = Date.now()): boolean {
  if (!cookie || !hash || !secret()) return false
  const [id, expStr, sig] = cookie.split('.')
  const exp = Number(expStr)
  if (id !== linkId || !sig || !Number.isFinite(exp) || exp < now) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(linkId, exp, hash))
  return a.length === b.length && timingSafeEqual(a, b)
}
