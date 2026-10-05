import { signPayload, verifySignature, signingConfigured } from '@/lib/signedToken'

// ─────────────────────────────────────────────────────────────────────────────
// לוח המנהל של היריד — קישור נפרד בסיסמה (/yerid/dashboard).
//
// 🔴 מה הלוח חושף: מספרים בלבד (החלטת המשתמש 05.10). אין שמות לקוחות,
// טלפונים, מיילים או כתובות — גם לא בתשובת ה-API. מי שהקישור והסיסמה
// דלפו אליו לומד כמה נמכר, לא מי קנה.
//
// 🔴 גרסת סשן: כל אסימון נושא את מספר הגרסה שהיה בתוקף כשנוצר. החלפת
// סיסמה או "ניתוק כל המחוברים" מעלים את הגרסה — וכל אסימון ישן נפסל
// מיד, גם אם הקוקי שלו עוד בתוקף.
//
// ⚠️ הסיסמה נשמרת כ-HMAC (כמו סיסמת הדוכן) — אי אפשר להציג אותה שוב.
// ─────────────────────────────────────────────────────────────────────────────

export const DASH_CONFIG_KEY = 'book_fair_dashboard'
/** ⚠️ מפתח נפרד — ראו ההערה ב-api/yerid/dashboard/login. */
export const DASH_LAST_LOGIN_KEY = 'book_fair_dashboard_last_login'
export const DASH_COOKIE = 'fair_dash'
/** 14 יום — מנהל שפותח מהטלפון לא אמור להקליד סיסמה בכל יום של היריד. */
export const DASH_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const DASH_MIN_PASSWORD = 8

export type DashConfig = {
  password_hash: string
  enabled: boolean
  version: number
  updated_at: string | null
  last_login_at: string | null
}

export function parseDashConfig(raw: unknown): DashConfig {
  let o: Record<string, unknown> = {}
  try { o = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>) ?? {} } catch { /* פגום */ }
  const v = Number(o?.version)
  return {
    password_hash: typeof o?.password_hash === 'string' ? o.password_hash : '',
    // ⚠️ ברירת מחדל: כבוי עד שמוגדרת סיסמה ומופעל במפורש.
    enabled: o?.enabled === true,
    version: Number.isInteger(v) && v > 0 ? v : 1,
    updated_at: typeof o?.updated_at === 'string' ? o.updated_at : null,
    last_login_at: typeof o?.last_login_at === 'string' ? o.last_login_at : null,
  }
}

export function hashDashPassword(password: string): string | null {
  const clean = String(password ?? '').trim()
  if (!clean) return null
  return signPayload(`fair-dash-pw:${clean}`)
}

export function dashPasswordMatches(password: string, storedHash: string): boolean {
  const clean = String(password ?? '').trim()
  if (!clean || !storedHash) return false
  return verifySignature(`fair-dash-pw:${clean}`, storedHash)
}

/** אסימון: תפוגה + גרסה, חתומים. ⚠️ התפוגה בתוך המטען החתום. */
export function makeDashToken(version: number, now = Date.now()): string | null {
  const payload = `${now + DASH_TTL_MS}:${version}`
  const sig = signPayload(`fair-dash:${payload}`)
  return sig ? `${payload}:${sig}` : null
}

/**
 * אימות אסימון מול ההגדרות הנוכחיות.
 *
 * 🔴 נכשל-סגור: לוח כבוי, סיסמה לא מוגדרת, גרסה ישנה, חתימה שגויה או
 * תפוגה — כולם ⇒ false.
 */
export function dashTokenValid(token: unknown, cfg: DashConfig, now = Date.now()): boolean {
  if (!cfg.enabled || !cfg.password_hash) return false
  const parts = String(token ?? '').trim().split(':')
  if (parts.length !== 3) return false
  const [expRaw, verRaw, sig] = parts
  if (!verifySignature(`fair-dash:${expRaw}:${verRaw}`, sig)) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || now > exp) return false
  return Number(verRaw) === cfg.version
}

export { signingConfigured }
