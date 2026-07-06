import { createHmac, timingSafeEqual } from 'crypto'

// סשן חתום (HMAC) לפורטל בתי ההחלמה. עד כה ערך העוגייה היה '1' קבוע — כלומר
// ניתן לזיוף ע"י כל אחד שיודע את שם בית ההחלמה (חשיפת PII של יולדות + זיוף רשומות).
// כעת הערך חתום וקשור לשם בית ההחלמה + תוקף, ומאומת בכל בקשה.

const MAX_AGE_SECONDS = 60 * 60 * 24 // 24 שעות (זהה ל-maxAge הקודם)

function secret(): string {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

export const RECOVERY_PORTAL_MAX_AGE = MAX_AGE_SECONDS

// יוצר אסימון חתום עבור בית החלמה מסוים.
export function createRecoveryPortalToken(home: string): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = `${home}:${exp}`
  return Buffer.from(`${payload}:${sign(payload)}`).toString('base64url')
}

// מאמת שהאסימון חתום כראוי, לא פג, ושייך *בדיוק* לבית ההחלמה המבוקש.
export function verifyRecoveryPortalToken(token: string | undefined, home: string): boolean {
  if (!token || !home) return false
  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return false }
  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return false
  const payload = decoded.slice(0, lastSep)
  const sig = decoded.slice(lastSep + 1)
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  // payload = `${home}:${exp}` — שמות בתי החלמה אינם מכילים ':' (עברית/מספרים)
  const sep = payload.lastIndexOf(':')
  const tokenHome = payload.slice(0, sep)
  const expStr = payload.slice(sep + 1)
  if (tokenHome !== home) return false
  if (!expStr || Number(expStr) < Date.now()) return false
  return true
}
