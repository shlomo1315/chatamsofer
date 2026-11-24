import { randomBytes } from 'crypto'
import { signPayload, verifySignature } from '@/lib/signedToken'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// טוקן חתום לקישורים ציבוריים (מכתב ברכה / משוב בית החלמה).
// אותו דפוס HMAC כמו lib/portalSession.ts — לא ניתן לניחוש ולא לזיוף.
// הטוקן מקודד את סוג הפנייה ואת מזהה הלידה, ופג אחרי 90 יום.
// ─────────────────────────────────────────────────────────────────────────────

// g = gratitude, s = survey, l = loan inquiry, n = name-fix (תיקון שם התינוק)
// g=מכתב ברכה · s=שיתוף · l=בירור הלוואה · n=תיקון שם · m=בירור יולדת
// f=מעקב הזמנה ביריד הספרים
export type PublicTokenKind = 'g' | 's' | 'l' | 'n' | 'm' | 'f' | 'a'

const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 יום (ברירת מחדל)
// תוקף מותאם לכל סוג.
//
// 🔴 A7 (24.11): תיקון שם היה תקף 7 ימים בלבד, ומשפחות שפתחו את המייל אחרי
// שבוע קיבלו "הקישור אינו תקין" בלי דרך להמשיך. עכשיו 30 יום (ניתן לשינוי
// ב-NAME_FIX_LINK_DAYS), ובדף שפג יש כפתור לקבלת קישור חדש למייל הרשום.
//
// ⚠️ מעקב הזמנה ביריד תקף שנה: הלקוח מקבל את הקישור במייל, ועשוי לחזור
// אליו הרבה אחרי המשלוח כדי לאמת מה הזמין. קישור שפג הופך את המייל
// לחסר ערך, ואין כאן מידע רגיש מעבר לפרטי ההזמנה שלו עצמו.
const TTL_BY_KIND: Partial<Record<PublicTokenKind, number>> = {
  n: nameFixLinkDays() * 24 * 60 * 60 * 1000,
  f: 365 * 24 * 60 * 60 * 1000,
}

/** תוקף קישור השלמת שם התינוק בימים (ברירת מחדל 30). */
export function nameFixLinkDays(): number {
  const d = Number(process.env.NAME_FIX_LINK_DAYS)
  return Number.isFinite(d) && d >= 1 && d <= 365 ? Math.floor(d) : 30
}

/**
 * מזהה הלידה מטוקן שחתימתו תקינה — גם אם פג תוקפו.
 *
 * ⚠️ לשימוש בחידוש קישור בלבד: הקישור החדש נשלח רק למייל הרשום בתיק,
 * כך שמי שמחזיק טוקן ישן לא מקבל גישה — רק גורם לשליחה לבעלת התיק.
 */
export function aidIdFromSignedToken(token: string | undefined | null, kind: PublicTokenKind): string | null {
  if (!token) return null
  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }
  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return null
  const payload = decoded.slice(0, lastSep)
  if (!verifySignature(payload, decoded.slice(lastSep + 1))) return null
  const [k, aidId, exp] = payload.split(':')
  return payload.split(':').length === 3 && k === kind && aidId && exp ? aidId : null
}

// ⚠️ מחרוזת ריקה = אין סוד חתימה, ולכן אין קישור (ראו lib/signedToken).
export function signPublicToken(kind: PublicTokenKind, aidId: string): string {
  const exp = Date.now() + (TTL_BY_KIND[kind] ?? TTL_MS)
  const payload = `${kind}:${aidId}:${exp}`
  const sig = signPayload(payload)
  if (!sig) return ''
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

/** מאמת טוקן ומחזיר את מזהה הלידה, או null אם אינו תקין/פג. */
export function verifyPublicToken(token: string | undefined | null, kind: PublicTokenKind): string | null {
  if (!token) return null

  let decoded: string
  try { decoded = Buffer.from(token, 'base64url').toString('utf-8') } catch { return null }

  const lastSep = decoded.lastIndexOf(':')
  if (lastSep < 0) return null

  const payload = decoded.slice(0, lastSep)
  const sig = decoded.slice(lastSep + 1)

  if (!verifySignature(payload, sig)) return null

  const parts = payload.split(':')
  if (parts.length !== 3) return null
  const [k, aidId, expStr] = parts

  if (k !== kind || !aidId) return null
  if (!Number(expStr) || Number(expStr) < Date.now()) return null

  return aidId
}

// ─────────────────────────────────────────────────────────────────────────────
// מזהה מענה קצר (reply token).
//
// הטוקן החתום למעלה הוא ~156 תווים — מצוין לקישור בדפדפן, אבל כתובת מייל
// כמו office+g<156 תווים>@... נדחית ע"י Resend ("Invalid reply_to field").
//
// לכן ל-plus-addressing משתמשים במזהה קצר ואקראי (12 תווים, 72 ביט אנטרופיה)
// שנשמר ב-DB. לא ניתן לניחוש, ומייצר כתובת קצרה ותקינה.
// ─────────────────────────────────────────────────────────────────────────────

const REPLY_TOKEN_BYTES = 9 // → 12 תווים ב-base64url

/** מנפיק (או מחזיר קיים) מזהה מענה קצר ללידה. */
export async function getOrCreateReplyToken(
  db: SupabaseClient,
  kind: PublicTokenKind,
  aidId: string,
  entityTable = 'maternity_aids',
): Promise<string | null> {
  try {
    // קיים ובתוקף — משתמשים בו שוב
    const { data: existing } = await db
      .from('reply_tokens')
      .select('token')
      .eq('kind', kind)
      .eq('entity_table', entityTable)
      .eq('entity_id', aidId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (existing?.token) return String(existing.token)

    const token = randomBytes(REPLY_TOKEN_BYTES).toString('base64url')

    const { error } = await db.from('reply_tokens').insert({
      token,
      kind,
      entity_table: entityTable,
      entity_id: aidId,
    })
    if (error) { console.error('[reply-token] הנפקה נכשלה:', error.message); return null }

    return token
  } catch (e) {
    console.error('[reply-token] threw:', e)
    return null
  }
}

/** מאמת מזהה מענה קצר ומחזיר את מזהה הלידה. */
export async function verifyReplyToken(
  db: SupabaseClient,
  token: string,
  kind: PublicTokenKind,
): Promise<string | null> {
  if (!token) return null

  const { data } = await db
    .from('reply_tokens')
    .select('entity_id, expires_at')
    .eq('token', token)
    .eq('kind', kind)
    .maybeSingle()

  if (!data) return null
  if (new Date(String(data.expires_at)) < new Date()) return null

  return String(data.entity_id)
}
