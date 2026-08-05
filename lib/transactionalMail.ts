import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// שליחת מייל תפעולי בעדיפות גבוהה — קוד אימות חד-פעמי.
//
// הניתוב עצמו (Gmail לנמעני ג'ימייל, Resend לכל השאר) חי ב-lib/sendMail ליד
// GMAIL ROUTING, וחל על כל המיילים התפעוליים. כאן רק נקבעים שני דברים
// שייחודיים לקוד האימות:
//
//   • gmailPriority: 'high' — לקוד האימות שמורה מכסה יומית גדולה יותר משאר
//     המיילים. הוא היחיד שחוסם אדם מלהשלים הרשמה; אישור הרשמה שמתעכב מעצבן,
//     קוד אימות שלא מגיע עוצר את התהליך כולו.
//
//   • כתובת שולח ייעודית, שברור ממנה שאין להשיב אליה. ⚠️ במסלול Gmail היא
//     תיתפס רק אם היא מוגדרת בחשבון כ-"Send mail as" ומאומתת; אחרת Gmail
//     מתעלם ושולח מהכתובת הראשית, בלי להיכשל ובלי להתריע.
// ─────────────────────────────────────────────────────────────────────────────

const FROM_EMAIL = process.env.VERIFY_FROM_EMAIL || 'noreply@chasamsofer.info'
const FROM_NAME = process.env.VERIFY_FROM_NAME || 'היכל החתם סופר'

export interface TransactionalResult { ok: boolean; via: 'gmail' | 'resend'; id?: string; error?: string }

/**
 * שליחת מייל קוד אימות. admin אינו בשימוש עוד (המונה היומי מנוהל ב-sendMail),
 * ונשאר בחתימה כדי לא לשנות את הקוראים.
 */
export async function sendTransactionalMail(
  _admin: SupabaseClient | null,
  to: string,
  subject: string,
  html: string,
): Promise<TransactionalResult> {
  const res = await deliverMail(to, subject, html, undefined, {
    ...mailFor('igud'),
    fromEmail: FROM_EMAIL, fromName: FROM_NAME,
    skipLog: true, transactional: true, gmailPriority: 'high',
  })
  if (!res || !res.ok) return { ok: false, via: 'resend', error: res?.error }
  // היעדר מזהה Resend פירושו שההודעה יצאה במסלול Gmail.
  return { ok: true, via: res.id ? 'resend' : 'gmail', id: res.id }
}
