import type { SupabaseClient } from '@supabase/supabase-js'
import { signPayload, verifySignature, signingConfigured } from '@/lib/signedToken'

// ─────────────────────────────────────────────────────────────────────────────
// אזור המוכרים ביריד — אימות בסיסמה משותפת.
//
// 🔴 סיסמה אחת משותפת ולא חשבון לכל מוכר: הדוכן מופעל ע"י מתנדבים
// מתחלפים, וחשבון לכל אחד היה אומר שמי שמגיע בלי חשבון אינו יכול למכור.
// שם המוכר נרשם על ההזמנה בנפרד (sold_by) — לתיעוד, לא לאימות.
//
// 🔴 מה האזור הזה *אינו*: הוא אינו ממשק ניהול. אין בו עריכת מחירים ואין
// מחיקת ספרים. מוכר שהסיסמה שלו דלפה יכול לרשום מכירות — לא לשנות את
// הקטלוג.
//
// ⚠️ חריג אחד מכוון (05.10): איסוף עצמי (api/yerid/seller/pickup) מציג
// שם לקוח + 4 ספרות טלפון, בהתאמה מדויקת בלבד ובמגבלת קצב. בלי כתובת,
// בלי מייל, בלי טלפון מלא ובלי חיפוש חלקי — ראו lib/bookFairStandPickup.ts.
//
// ⚠️ הסיסמה נשמרת כ-HMAC ב-app_settings ולא בטקסט גלוי: מי שקורא את
// הטבלה (גיבוי, תמיכה) לא אמור לדעת את הסיסמה.
// ─────────────────────────────────────────────────────────────────────────────

export const SELLER_CONFIG_KEY = 'book_fair_seller'
export const SELLER_COOKIE = 'fair_seller'

/** תוקף הסשן. ⚠️ יום אחד: יריד נמשך ימים, ומוכר שסוגר לשונית בבוקר
 *  אינו אמור להיכנס מחדש בכל פתיחה — אבל סשן נצחי על מכשיר משותף
 *  בדוכן הוא דלת פתוחה. */
export const SELLER_TTL_MS = 24 * 60 * 60 * 1000

/** גיבוב הסיסמה לשמירה. null = אין סוד חתימה בסביבה. */
export function hashSellerPassword(password: string): string | null {
  const clean = String(password ?? '').trim()
  if (!clean) return null
  return signPayload(`fair-seller-pw:${clean}`)
}

/** האם הסיסמה שהוקשה תואמת לגיבוב השמור. */
export function sellerPasswordMatches(password: string, storedHash: string): boolean {
  const clean = String(password ?? '').trim()
  if (!clean || !storedHash) return false
  return verifySignature(`fair-seller-pw:${clean}`, storedHash)
}

/**
 * טביעת הסיסמה הנוכחית — 16 תווים מהגיבוב.
 *
 * 🔴 נחתמת בתוך האסימון (ביקורת אבטחה 05.10): החלפת סיסמת הדוכן משנה
 * את הגיבוב, וכל אסימון שהונפק עם הסיסמה הקודמת נפסל *מיד*. קודם מי
 * שהסיסמה הישנה דלפה אליו נשאר מחובר עד 24 שעות — ויכול היה לרשום
 * מכירות במזומן ולמסור הזמנות איסוף.
 */
export function passwordTag(storedHash: string): string {
  return String(storedHash ?? '').slice(0, 16)
}

/**
 * אסימון הסשן: חותמת תפוגה + שם המוכר, חתומים יחד עם טביעת הסיסמה.
 *
 * ⚠️ התפוגה *בתוך* המטען החתום ולא רק בתוקף הקוקי: קוקי אפשר לערוך
 * בדפדפן, ותפוגה שנשענת עליו לבדה אינה תפוגה.
 */
export function makeSellerToken(name: string, storedHash: string, now = Date.now()): string | null {
  if (!storedHash) return null
  const exp = now + SELLER_TTL_MS
  // ⚠️ השם מנוקה מתווים שישברו את הפירוק (':' הוא המפריד).
  const safeName = String(name ?? '').replace(/[:|]/g, ' ').trim().slice(0, 40)
  const payload = `${exp}:${safeName}`
  const sig = signPayload(`fair-seller:${passwordTag(storedHash)}:${payload}`)
  if (!sig) return null
  return `${payload}:${sig}`
}

/**
 * מפרק ומאמת אסימון סשן מול גיבוב הסיסמה *הנוכחי*.
 * מחזיר null כשפג, מזויף, או הונפק לפני החלפת הסיסמה.
 */
export function readSellerToken(token: unknown, storedHash: string, now = Date.now()): { name: string } | null {
  const raw = String(token ?? '').trim()
  if (!raw || !storedHash) return null

  // ⚠️ פיצול ל-3 חלקים *מהסוף*: שם המוכר עשוי להכיל רווחים, אך לא ':'.
  const parts = raw.split(':')
  if (parts.length < 3) return null
  const sig = parts[parts.length - 1]
  const exp = Number(parts[0])
  const name = parts.slice(1, -1).join(':')
  if (!Number.isFinite(exp)) return null

  const payload = `${exp}:${name}`
  if (!verifySignature(`fair-seller:${passwordTag(storedHash)}:${payload}`, sig)) return null
  // 🔴 התפוגה נבדקת *אחרי* החתימה: בדיקת תפוגה על מטען לא מאומת
  // מאפשרת לתוקף להסיק מהתשובה אם החתימה נכונה.
  if (now > exp) return null

  return { name }
}

/** גיבוב הסיסמה השמור. '' = לא הוגדרה (האזור סגור). */
export function parseSellerHash(raw: unknown): string {
  try {
    const cfg = raw ? JSON.parse(String(raw)) : null
    return String(cfg?.password_hash ?? '')
  } catch { return '' }
}

/** המוכר המחובר לבקשה הזו, מול הסיסמה הנוכחית. null = לא מחובר. */
export async function sellerFromRequest(
  token: unknown,
  db: SupabaseClient,
): Promise<{ name: string } | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', SELLER_CONFIG_KEY).maybeSingle()
  return readSellerToken(token, parseSellerHash(data?.value))
}

export { signingConfigured }
