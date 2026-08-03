import { signPayload, verifySignature } from '@/lib/signedToken'

// סשן חתום (HMAC) לפורטל בתי ההחלמה. עד כה ערך העוגייה היה '1' קבוע — כלומר
// ניתן לזיוף ע"י כל אחד שיודע את שם בית ההחלמה (חשיפת PII של יולדות + זיוף רשומות).
// כעת הערך חתום וקשור לשם בית ההחלמה + תוקף, ומאומת בכל בקשה.

const MAX_AGE_SECONDS = 60 * 60 * 24 // 24 שעות (זהה ל-maxAge הקודם)

export const RECOVERY_PORTAL_MAX_AGE = MAX_AGE_SECONDS

// יוצר אסימון חתום עבור בית החלמה מסוים.
// ⚠️ מחרוזת ריקה = אין סוד חתימה, ולכן אין אסימון (ראו lib/signedToken).
export function createRecoveryPortalToken(home: string): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000
  const payload = `${home}:${exp}`
  const sig = signPayload(payload)
  if (!sig) return ''
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
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
  if (!verifySignature(payload, sig)) return false
  // payload = `${home}:${exp}` — שמות בתי החלמה אינם מכילים ':' (עברית/מספרים)
  const sep = payload.lastIndexOf(':')
  const tokenHome = payload.slice(0, sep)
  const expStr = payload.slice(sep + 1)
  if (tokenHome !== home) return false
  if (!expStr || Number(expStr) < Date.now()) return false
  return true
}
