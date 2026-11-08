import { createHmac, timingSafeEqual } from 'crypto'

// ─── מדיניות סשן של מסכי הניהול ───────────────────────────────────────────────
// שני גבולות, שנאכפים בשרת (proxy + requireStaff) ולא רק בדפדפן:
//
// 1. תוקף מוחלט: SESSION_MAX_MS מרגע הכניסה. זמן הכניסה נלקח מטענת amr
//    שבתוך ה-JWT של Supabase. היא חתומה בשרת האימות, נשמרת ברענון הטוקן
//    ומתאפסת רק בכניסה מחדש, כך שאי אפשר "להאריך" אותה מהדפדפן.
//
// 2. חוסר פעילות: הדפדפן מקפיץ "האם אתה עדיין כאן?" אחרי IDLE_MS, ומנתק אחרי
//    PROMPT_MS נוספים. בשרת נשמרת עוגייה חתומה עם זמן הפעילות האחרון, שמתעדכנת
//    רק דרך /api/auth/session (POST) (פעילות אמיתית של עכבר/מקלדת). אם הדפדפן נסגר,
//    הוקפא או שהקוד בו עוקף, השרת מנתק אחרי IDLE_MS + PROMPT_MS + IDLE_GRACE_MS.
//    עוגייה חסרה או מזויפת = ניתוק, חוץ מדקות ספורות אחרי כניסה טרייה.

export const SESSION_MAX_MS = 8 * 60 * 60 * 1000
export const IDLE_MS = 30 * 60 * 1000
export const PROMPT_MS = 120 * 1000
export const IDLE_GRACE_MS = 5 * 60 * 1000
export const FRESH_LOGIN_MS = 10 * 60 * 1000
export const SEEN_COOKIE = 'hq_seen'

function secret(): string {
  return process.env.SESSION_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

/** ערך עוגיית הפעילות: userId.ts.sig */
export function makeSeenCookie(userId: string, ts: number): string {
  const payload = `${userId}.${ts}`
  return `${payload}.${sign(payload)}`
}

/** זמן הפעילות האחרון מהעוגייה, או null אם חסרה, מזויפת או של משתמש אחר. */
export function readSeenCookie(value: string | undefined | null, userId: string): number | null {
  if (!value || !secret()) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [uid, tsRaw, sig] = parts
  if (uid !== userId || !/^\d{10,15}$/.test(tsRaw)) return null
  const expected = Buffer.from(sign(`${uid}.${tsRaw}`))
  const got = Buffer.from(sig)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  return Number(tsRaw)
}

/**
 * זמן הכניסה (ms) מתוך טענת amr של ה-access token, או null אם אין.
 * ⚠️ מפענח בלי לאמת חתימה: הקוראים מאמתים את אותו טוקן קודם ב-getUser.
 */
export function authTimeFromAccessToken(token: string | undefined | null): number | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as {
      amr?: { method?: string; timestamp?: number }[]
    }
    const stamps = (payload.amr ?? [])
      .map(a => Number(a?.timestamp))
      .filter(n => Number.isFinite(n) && n > 0)
    if (!stamps.length) return null
    return Math.max(...stamps) * 1000
  } catch {
    return null
  }
}

export type SessionVerdict =
  | { ok: true; expiresAt: number | null; refreshSeen: boolean }
  | { ok: false; reason: 'expired' | 'idle' }

/**
 * הכרעה אם הסשן עדיין בתוקף.
 * refreshSeen = יש לכתוב עוגיית פעילות עכשיו (כניסה טרייה, או אין amr ולכן
 * אין דרך לדעת מתי נכנס — במצב הזה לא מנתקים, כדי לא להיכנס ללולאת ניתוקים).
 */
export function evaluateSession(opts: { now: number; authAt: number | null; seenAt: number | null }): SessionVerdict {
  const { now, authAt, seenAt } = opts
  if (authAt !== null && now - authAt > SESSION_MAX_MS) return { ok: false, reason: 'expired' }
  const expiresAt = authAt !== null ? authAt + SESSION_MAX_MS : null

  if (seenAt === null) {
    if (authAt === null || now - authAt < FRESH_LOGIN_MS) return { ok: true, expiresAt, refreshSeen: true }
    return { ok: false, reason: 'idle' }
  }
  if (now - seenAt > IDLE_MS + PROMPT_MS + IDLE_GRACE_MS) return { ok: false, reason: 'idle' }
  return { ok: true, expiresAt, refreshSeen: false }
}

export const SEEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_MS / 1000,
}
