import { randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signPayload, verifySignature } from '@/lib/signedToken'
import { DISTRIBUTOR_LOGIN_BY, normalizeLoginId, type LoginBy } from '@/lib/gilyonotDistributors'

// ─────────────────────────────────────────────────────────────────────────────
// כניסת מפיץ לממשק שלו (app/gilyonot/mefitz): מזהה (לפי DISTRIBUTOR_LOGIN_BY)
// + קוד חד-פעמי שנשלח למייל הרשום, או בשיחה לטלפון כשאין מייל.
//
// הסשן קשור למזהה ולא לשורה: אדם שמפיץ בכמה בתי כנסת רואה את כולם. מפיץ שהוסר,
// או שהמזהה שלו שונה במשרד, פשוט לא נמצא יותר, ולכן הסשן שלו ריק מיד.
// ⚠️ הממשק נותן גישה רק לשורות המפיץ עצמו. אין כאן שום גישה לשאר הגיליונות.
// ─────────────────────────────────────────────────────────────────────────────

export const DISTRIBUTOR_COOKIE = 'gilyonot_mefitz'
export const SESSION_DAYS = 30
export const CODE_TTL_MIN = 10
export const MAX_CODE_ATTEMPTS = 5
export const MAX_CODES_PER_WINDOW = 3 // בכל 15 דקות לכל מזהה

export interface LoginIdentity { by: LoginBy; value: string }
export const loginKey = (id: LoginIdentity) => `${id.by}:${id.value}`

/** מזהה כניסה מהטופס (או null אם אינו תקין לפי שיטת הזיהוי הנוכחית). */
export function parseLogin(raw: unknown, by: LoginBy = DISTRIBUTOR_LOGIN_BY): LoginIdentity | null {
  const value = normalizeLoginId(by, raw)
  return value ? { by, value } : null
}

// ── עוגיית הסשן: base64url("by|value|exp").sig ──
export function createSessionToken(id: LoginIdentity, now = Date.now()): string | null {
  const payload = Buffer.from(`${id.by}|${id.value}|${now + SESSION_DAYS * 86_400_000}`).toString('base64url')
  const sig = signPayload(`gdsess:${payload}`, 'base64url')
  return sig ? `${payload}.${sig}` : null
}

export function readSessionToken(token: string | undefined | null, now = Date.now()): LoginIdentity | null {
  if (!token || token.length > 400) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const payload = token.slice(0, dot)
  if (!verifySignature(`gdsess:${payload}`, token.slice(dot + 1), 'base64url')) return null
  const [by, value, exp] = Buffer.from(payload, 'base64url').toString('utf-8').split('|')
  // ⚠️ סשן משיטת זיהוי קודמת נפסל: אחרי החלפת השיטה כולם נכנסים מחדש
  if (by !== DISTRIBUTOR_LOGIN_BY || !value || !(Number(exp) > now)) return null
  return { by, value }
}

export const sessionCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: SESSION_DAYS * 86_400,
}

// ── שורות המפיץ לפי המזהה ──
export function matchIdentity<Q extends { eq: (c: string, v: string) => Q; or: (f: string) => Q }>(q: Q, id: LoginIdentity): Q {
  if (id.by === 'phone') return q.or(`phone.eq.${id.value},phone2.eq.${id.value}`)
  return q.eq(id.by, id.value)
}

const codeHash = (key: string, code: string) => signPayload(`gdcode:${key}:${code}`)

/**
 * יוצר קוד חדש ושומר את ה-hash שלו. מחזיר את הקוד (לשליחה) או סיבת סירוב.
 * ⚠️ הקוד עצמו לעולם לא נשמר ולא נרשם ביומן.
 */
export async function issueLoginCode(db: SupabaseClient, id: LoginIdentity): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const key = loginKey(id)
  const since = new Date(Date.now() - 15 * 60_000).toISOString()
  const { count } = await db.from('gilyonot_distributor_codes').select('id', { count: 'exact', head: true }).eq('login_key', key).gte('created_at', since)
  if ((count ?? 0) >= MAX_CODES_PER_WINDOW) return { ok: false, error: 'נשלחו כבר כמה קודים. נסו שוב בעוד רבע שעה.' }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const hash = codeHash(key, code)
  if (!hash) return { ok: false, error: 'השרת אינו מוגדר' }
  const { error } = await db.from('gilyonot_distributor_codes').insert({
    login_key: key, code_hash: hash, expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  })
  if (error) return { ok: false, error: 'יצירת הקוד נכשלה' }
  return { ok: true, code }
}

/**
 * בודק קוד מול הקוד האחרון שבתוקף. כל ניסיון "נתפס" בעדכון מותנה לפני ההשוואה,
 * כדי שניחושים במקביל לא יעקפו את מגבלת הניסיונות (ראו lib/otpAttempt.ts).
 */
export async function verifyLoginCode(db: SupabaseClient, id: LoginIdentity, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  const key = loginKey(id)
  const { data: row } = await db.from('gilyonot_distributor_codes')
    .select('id, code_hash, attempts')
    .eq('login_key', key).is('used_at', null).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return false
  const { data: claimed } = await db.from('gilyonot_distributor_codes')
    .update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('attempts', row.attempts).select('id')
  if (!claimed?.length) return false
  const expected = codeHash(key, code)
  if (!expected || expected !== row.code_hash) return false
  const { data: used } = await db.from('gilyonot_distributor_codes')
    .update({ used_at: new Date().toISOString() }).eq('id', row.id).is('used_at', null).select('id')
  return !!used?.length
}
