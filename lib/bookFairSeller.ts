import { signPayload, verifySignature, signingConfigured } from '@/lib/signedToken'

// ─────────────────────────────────────────────────────────────────────────────
// אזור המוכרים ביריד — אימות בסיסמה משותפת.
//
// 🔴 סיסמה אחת משותפת ולא חשבון לכל מוכר: הדוכן מופעל ע"י מתנדבים
// מתחלפים, וחשבון לכל אחד היה אומר שמי שמגיע בלי חשבון אינו יכול למכור.
// שם המוכר נרשם על ההזמנה בנפרד (sold_by) — לתיעוד, לא לאימות.
//
// 🔴 מה האזור הזה *אינו*: הוא אינו ממשק ניהול. אין בו עריכת מחירים, אין
// מחיקת ספרים ואין גישה לנתוני לקוחות. מוכר שהסיסמה שלו דלפה יכול לרשום
// מכירות — לא לשנות את הקטלוג.
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
 * אסימון הסשן: חותמת תפוגה + שם המוכר, חתומים.
 *
 * ⚠️ התפוגה *בתוך* המטען החתום ולא רק בתוקף הקוקי: קוקי אפשר לערוך
 * בדפדפן, ותפוגה שנשענת עליו לבדה אינה תפוגה.
 */
export function makeSellerToken(name: string, now = Date.now()): string | null {
  const exp = now + SELLER_TTL_MS
  // ⚠️ השם מנוקה מתווים שישברו את הפירוק (':' הוא המפריד).
  const safeName = String(name ?? '').replace(/[:|]/g, ' ').trim().slice(0, 40)
  const payload = `${exp}:${safeName}`
  const sig = signPayload(`fair-seller:${payload}`)
  if (!sig) return null
  return `${payload}:${sig}`
}

/** מפרק ומאמת אסימון סשן. מחזיר null כשפג או מזויף. */
export function readSellerToken(token: unknown, now = Date.now()): { name: string } | null {
  const raw = String(token ?? '').trim()
  if (!raw) return null

  // ⚠️ פיצול ל-3 חלקים *מהסוף*: שם המוכר עשוי להכיל רווחים, אך לא ':'.
  const parts = raw.split(':')
  if (parts.length < 3) return null
  const sig = parts[parts.length - 1]
  const exp = Number(parts[0])
  const name = parts.slice(1, -1).join(':')
  if (!Number.isFinite(exp)) return null

  const payload = `${exp}:${name}`
  if (!verifySignature(`fair-seller:${payload}`, sig)) return null
  // 🔴 התפוגה נבדקת *אחרי* החתימה: בדיקת תפוגה על מטען לא מאומת
  // מאפשרת לתוקף להסיק מהתשובה אם החתימה נכונה.
  if (now > exp) return null

  return { name }
}

export { signingConfigured }
