import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'crypto'

export const PORTAL_COOKIE = 'loans_portal_token'
const TOKEN_DAYS_VALID = 14

function secret() {
  // ללא ברירת-מחדל ציבורית: אם LOANS_PORTAL_SECRET לא הוגדר — נופלים למפתח ה-service-role
  // (שתמיד קיים בשרת), כדי שלא ייחתם לעולם עם קבוע ידוע-פומבית.
  return process.env.LOANS_PORTAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function getStoredPasswordHash(): Promise<string | null> {
  const admin = adminClient()
  const { data } = await admin.from('app_settings').select('value').eq('key', 'loans_portal_password').single()
  return data?.value || null
}

export async function setPortalPassword(plaintext: string): Promise<void> {
  const hash = await bcrypt.hash(plaintext, 12)
  const admin = adminClient()
  await admin.from('app_settings').upsert(
    { key: 'loans_portal_password', value: hash, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

/**
 * "טביעת אצבע" של הסיסמה הנוכחית — נכנסת לחתימת הטוקן.
 *
 * ⚠️ בלעדיה החלפת סיסמה לא מבטלת טוקנים קיימים: מי שקיבל את הקישור פעם
 * נשאר בפנים 14 יום גם אחרי שהחלפתם את הסיסמה כדי לחסום אותו. עכשיו כל
 * setPortalPassword משנה את ה-hash, ולכן פוסל אוטומטית כל טוקן ישן.
 *
 * נגזר מה-hash (ולא מהסיסמה) — כך שהסיסמה עצמה לעולם לא נכנסת לחתימה.
 */
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
  const sig = createHmac('sha256', secret()).update(`loans_portal:${day}:${fp}`).digest('hex')
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
  const expected = createHmac('sha256', secret()).update(`loans_portal:${day}:${fp}`).digest('hex')
  // constant-time comparison
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
