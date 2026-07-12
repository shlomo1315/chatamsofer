import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// הסרה מרשימת תפוצה.
//
// זו לא תוספת — זו חובה חוקית (חוק התקשורת, תיקון 40) ותנאי טכני של Gmail
// לשולחים מסיביים (One-Click unsubscribe). בלעדיה המיילים נחסמים כספאם.
//
// חשוב: ההסרה חלה על דיוור בלבד. מיילים תפעוליים (אישור לידה, שובר, משוב)
// ממשיכים להישלח — הם שירות שהמוטב ביקש, לא פרסומת.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

function secret(): string {
  return process.env.OTP_NONCE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex')
}

/** טוקן חתום — מונע הסרה של מישהו אחר ע"י ניחוש כתובת. */
export function signUnsubscribeToken(email: string, campaignId?: string | null): string {
  const payload = `${email.toLowerCase().trim()}|${campaignId ?? ''}`
  return Buffer.from(`${payload}|${sign(payload)}`).toString('base64url')
}

export function verifyUnsubscribeToken(
  token: string | undefined | null,
): { email: string; campaignId: string | null } | null {
  if (!token) return null

  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }

  const parts = decoded.split('|')
  if (parts.length !== 3) return null

  const [email, campaignId, sig] = parts
  const payload = `${email}|${campaignId}`

  const a = Buffer.from(sig)
  const b = Buffer.from(sign(payload))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (!email.includes('@')) return null

  return { email, campaignId: campaignId || null }
}

export function unsubscribeUrl(email: string, campaignId?: string | null): string {
  return `${SITE}/api/unsubscribe/${signUnsubscribeToken(email, campaignId)}`
}

/** רישום הסרה. אידמפוטנטי — הסרה חוזרת לא נכשלת. */
export async function addUnsubscribe(
  db: SupabaseClient,
  email: string,
  reason: 'user' | 'bounce' | 'complaint' | 'manual',
  campaignId?: string | null,
  beneficiaryId?: string | null,
): Promise<void> {
  const clean = email.toLowerCase().trim()
  if (!clean.includes('@')) return

  const { error } = await db.from('unsubscribes').upsert({
    email: clean,
    reason,
    campaign_id: campaignId ?? null,
    beneficiary_id: beneficiaryId ?? null,
  }, { onConflict: 'email', ignoreDuplicates: true })

  if (error) console.error('[unsubscribe] הוספה נכשלה:', error.message)
}

/**
 * שולף את רשימת המוסרים — לסינון בעת מימוש הסגמנט.
 * מי שכאן לעולם לא ייכנס לקמפיין. לא ניתן לעקוף.
 */
export async function suppressionSet(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db.from('unsubscribes').select('email')
  return new Set((data ?? []).map(r => String(r.email).toLowerCase().trim()))
}
