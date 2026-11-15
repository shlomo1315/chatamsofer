import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// הצפנת ת"ז, גיבוב לייחודיות, קודי כניסה וסשן השדכן.
// המפתח: MATCHMAKER_SECRET (מומלץ משתנה ייעודי), ובהיעדרו מפתח השירות.
// ─────────────────────────────────────────────────────────────────────────────

export const MM_COOKIE = 'matchmaker_session'
export const MM_SESSION_MINUTES = 30
export const MM_CODE_MINUTES = 10
export const MM_CODE_MAX_ATTEMPTS = 5

function secret(): string {
  return process.env.MATCHMAKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function key(): Buffer {
  return createHash('sha256').update(`mm-enc:${secret()}`).digest()
}

/** גיבוב חד-כיווני של ערך מנורמל (ת"ז), לחיפוש וייחודיות בלי לחשוף את הערך. */
export function hashValue(v: string): string {
  return createHmac('sha256', secret()).update(`mm-hash:${v}`).digest('hex')
}

export function encryptValue(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.')
}

export function decryptValue(blob: string | null | undefined): string | null {
  if (!blob) return null
  try {
    const [iv, tag, enc] = blob.split('.')
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** הצגה מוסתרת חלקית: *****1234 */
export function maskId(id: string | null | undefined): string {
  if (!id) return '—'
  return `*****${id.slice(-4)}`
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashCode(matchmakerId: string, code: string): string {
  return createHmac('sha256', secret()).update(`mm-code:${matchmakerId}:${code}`).digest('hex')
}

export function codesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function sign(id: string, exp: number): string {
  return createHmac('sha256', secret()).update(`mm-session:${id}.${exp}`).digest('base64url')
}

export function issueSession(matchmakerId: string, now = Date.now()): string {
  const exp = now + MM_SESSION_MINUTES * 60_000
  return `${matchmakerId}.${exp}.${sign(matchmakerId, exp)}`
}

/** מחזיר את מזהה השדכן מהעוגייה, או null אם אינה תקפה. */
export function verifySession(cookie: string | undefined | null, now = Date.now()): string | null {
  if (!cookie || !secret()) return null
  const [id, expStr, sig] = cookie.split('.')
  const exp = Number(expStr)
  if (!id || !sig || !Number.isFinite(exp) || exp < now) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(id, exp))
  return a.length === b.length && timingSafeEqual(a, b) ? id : null
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: MM_SESSION_MINUTES * 60,
}
