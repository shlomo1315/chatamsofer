import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

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

// טוקן: "<day>.<hmac>" — תקף TOKEN_DAYS_VALID ימים, וקשור לסיסמה הנוכחית
export async function issuePortalToken(): Promise<string> {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  const fp = await passwordFingerprint()
  const sig = createHmac('sha256', secret()).update(`dist_portal:${day}:${fp}`).digest('hex')
  return `${day}.${sig}`
}

export async function verifyPortalToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const day = Number(token.slice(0, dot))
  const sig = token.slice(dot + 1)
  if (isNaN(day)) return false
  const now = Math.floor(Date.now() / (24 * 60 * 60 * 1000))
  if (now - day > TOKEN_DAYS_VALID || day > now) return false
  const fp = await passwordFingerprint()
  const expected = createHmac('sha256', secret()).update(`dist_portal:${day}:${fp}`).digest('hex')
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
