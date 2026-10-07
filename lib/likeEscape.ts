/**
 * ניטרול תווים מיוחדים לביטוי LIKE / ILIKE — כך שהערך יותאם מילולית.
 *
 * 🔴 ביקורת אבטחה 07.10: זיהוי איש הצוות לפי מייל (proxy, apiAuth,
 * auth/callback) השתמש ב-`.ilike('email', user.email)` גולמי. `_` ו-`%`
 * במייל הם תווים כלליים, כך שכתובת כמו `a_b@x.com` הותאמה גם לפרופיל
 * `axb@x.com` — וזיהוי שגוי של איש צוות הוא הענקת הרשאות.
 *
 * ⚠️ ilike נשאר (ולא eq): המיילים נשמרים בטבלה ברישיות שבה הוזנו.
 */
export function escapeLike(value: string): string {
  return String(value ?? '').replace(/[\\%_]/g, m => `\\${m}`)
}
