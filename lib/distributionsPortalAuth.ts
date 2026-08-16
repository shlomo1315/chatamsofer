import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'
import { issueSession, verifySession, revokeSessionByToken } from './portalSessions'

// ─────────────────────────────────────────────────────────────────────────────
// דף שיתוף חלוקות חגים — אימות סיסמה אחת (view-only).
//
// דפוס זהה ל-lib/loansPortalAuth: סיסמה אחת ב-app_settings, cookie נפרד, וטוקן
// חתום שקשור לסיסמה הנוכחית (החלפת סיסמה פוסלת קישורים ישנים). מבודד לחלוטין
// מ-portal ההלוואות — key וcookie נפרדים — כדי ששיתוף אחד לא ייפתח עם השני.
// ─────────────────────────────────────────────────────────────────────────────

export const DIST_PORTAL_COOKIE = 'distributions_portal_token'
const PW_KEY = 'distributions_portal_password'
const TOKEN_DAYS_VALID = 30

function secret() {
  // ללא ברירת-מחדל ציבורית: נופלים למפתח ה-service-role שתמיד קיים בשרת.
  return process.env.DISTRIBUTIONS_PORTAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function getStoredPasswordHash(): Promise<string | null> {
  const admin = adminClient()
  const { data } = await admin.from('app_settings').select('value').eq('key', PW_KEY).single()
  return data?.value || null
}

/** האם הוגדרה סיסמה לדף השיתוף (לתצוגת הסטטוס במסך ההגדרות). */
export async function hasPortalPassword(): Promise<boolean> {
  return !!(await getStoredPasswordHash())
}

export async function setPortalPassword(plaintext: string): Promise<void> {
  const hash = await bcrypt.hash(plaintext, 12)
  const admin = adminClient()
  await admin.from('app_settings').upsert(
    { key: PW_KEY, value: hash, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

// "טביעת אצבע" של הסיסמה — נכנסת לחתימת הטוקן, כך שהחלפת סיסמה פוסלת טוקנים
// ישנים אוטומטית. נגזרת מה-hash (לא מהסיסמה) — הסיסמה עצמה לא נכנסת לחתימה.
async function passwordFingerprint(): Promise<string> {
  const hash = await getStoredPasswordHash()
  if (!hash) return 'none'
  return createHmac('sha256', secret()).update(`pw:${hash}`).digest('hex').slice(0, 16)
}

export async function verifyPortalPassword(plaintext: string): Promise<boolean> {
  const hash = await getStoredPasswordHash()
  if (!hash) return false
  return bcrypt.compare(plaintext, hash)
}

/**
 * טוקן כניסה — `<sessionId>.<hmac>`, מזהה אקראי לכל כניסה.
 * 🔴 ראו ההסבר המלא ב-lib/portalSessions: הפורמט הישן היה זהה לכל מי
 * שנכנס באותו יום, ולכן העתקת עוגייה נתנה גישה מלאה בלי סיסמה.
 */
export async function issuePortalToken(meta?: { userAgent?: string | null; ip?: string | null }): Promise<string> {
  const fp = await passwordFingerprint()
  const { token } = await issueSession('distributions', fp, secret(), TOKEN_DAYS_VALID, meta)
  return token
}

export async function verifyPortalToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const fp = await passwordFingerprint()

  // ⚠️ טוקן ישן ("<יום>.<hmac>") נתמך עד לפקיעתו, כדי שהפריסה לא תנתק
  // את כל מי שמחובר כרגע. מזהה הסשן החדש הוא 64 תווי hex ולעולם אינו
  // נראה כמספר יום.
  const head = token.slice(0, dot)
  if (/^\d{1,7}$/.test(head)) {
    const day = Number(head)
    const now = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
    if (now - day > TOKEN_DAYS_VALID || day > now) return false
    const sig = token.slice(dot + 1)
    const expected = createHmac('sha256', secret()).update(`dist_portal:${day}:${fp}`).digest('hex')
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  }

  return verifySession('distributions', token, fp, secret())
}

/** יציאה מרצון — מנתקת את הסשן הזה בלבד. */
export async function revokePortalToken(token: string | undefined): Promise<void> {
  if (!token || /^\d{1,7}\./.test(token)) return
  await revokeSessionByToken('distributions', token)
}
