// ─────────────────────────────────────────────────────────────────────────────
// חתימת קישור ההסרה מרשימת התפוצה.
//
// 🔴 למה חתום ולא כתובת גולמית: קישור הסרה שמכיל רק את המייל מאפשר
// לכל אחד להסיר כל אדם אחר מהרשימה — די לנחש כתובת. החתימה קושרת את
// הקישור לכתובת אחת בלבד.
//
// ⚠️ זו אינה הגנת סוד אלא הגנת שלמות: התוכן גלוי בקישור במכוון, כדי
// שההסרה תעבוד בלחיצה אחת בלי התחברות. מי שלוחץ ביקש לצאת, ואימות
// נוסף רק היה מונע ממנו לעשות זאת.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cleanEmail } from './emailAddress'

function secret(): string {
  // ⚠️ אותו סוד שכבר קיים בשרת. מפתח ייעודי היה נשכח בהגדרת הסביבה,
  // והקישורים היו נשברים אחרי פריסה בלי שאיש ישים לב.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXTAUTH_SECRET ?? 'book-fair-unsub'
}

/** חתימה קצרה לכתובת. ⚠️ תמיד על הכתובת המנוקה — אחרת האימות ייכשל. */
export function signUnsubscribe(email: string): string {
  return createHmac('sha256', secret())
    .update(`unsub:${cleanEmail(email)}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * אימות החתימה.
 *
 * ⚠️ timingSafeEqual ולא === : השוואת מחרוזות רגילה נעצרת בתו הראשון
 * שנבדל, וההפרש בזמן מאפשר לנחש חתימה תו-אחר-תו.
 */
export function verifyUnsubscribe(email: string, token: unknown): boolean {
  const given = String(token ?? '')
  const want = signUnsubscribe(email)
  if (given.length !== want.length) return false
  try {
    return timingSafeEqual(Buffer.from(given), Buffer.from(want))
  } catch {
    return false
  }
}
