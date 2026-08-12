// ─────────────────────────────────────────────────────────────────────────────
// הזמנה חד-פעמית לרישום לחלוקת חגים — הלוגיקה הטהורה.
//
// 🔴 מה הקישור עושה: מתיר למשפחה *אחת* להירשם לחלוקה *אחת*, גם כשהרישום
// סגור. הוא אינו פותח את הרישום, אינו נוגע במתג המחלקה, ואינו נראה לאיש אחר.
//
// עד היום החלופה היחידה הייתה לפתוח את הרישום לכולם ולסגור מיד — מה שפותח
// את כל הערוצים (פורטל, טלפון, נדרים, מייל) לכל העולם למשך אותן דקות.
//
// ⚠️ ההכרעה שאסור לטשטש: הבדיקות כאן קובעות מה *מותר*, אבל המימוש עצמו חייב
// להיות אטומי במסד (עדכון מותנה על used_at is null). קריאה-ואז-כתיבה הייתה
// מאפשרת לשתי לחיצות מקבילות לעבור שתיהן — וזו בדיוק הנקודה שבה קישור
// "חד-פעמי" מפסיק להיות חד-פעמי.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto'

export interface InviteRow {
  token: string
  distribution_id: string
  beneficiary_id: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

/**
 * למה ההזמנה נדחתה — או שהיא תקפה.
 *
 * ⚠️ הסיבות נפרדות כדי שההודעה למשפחה תהיה נכונה: "כבר נרשמתם" ו"הקישור פג"
 * מחייבים פעולה אחרת לגמרי מצד המשרד, ו"לא תקין" גורף היה מייצר פניות
 * טלפוניות שאי אפשר לענות עליהן.
 */
export type InviteVerdict =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'used' | 'expired' | 'revoked' | 'wrong-distribution' }

/** הודעה למשפחה לכל סיבת דחייה. */
export const INVITE_MESSAGE: Record<Exclude<InviteVerdict, { ok: true }>['reason'], string> = {
  'not-found': 'הקישור אינו תקין. אנא פנו למשרד לקבלת קישור חדש.',
  'used': 'הקישור הזה כבר נוצל והרישום נקלט. אין צורך בפעולה נוספת.',
  'expired': 'תוקף הקישור פג. אנא פנו למשרד לקבלת קישור חדש.',
  'revoked': 'הקישור בוטל. אנא פנו למשרד.',
  'wrong-distribution': 'הקישור שייך לחלוקה אחרת. אנא פנו למשרד.',
}

/**
 * אורך הטוקן — 32 תווים hex = 128 ביט אקראיות.
 *
 * ⚠️ הטוקן *הוא* ההרשאה: מי שמחזיק בו רשאי לרשום את המשפחה. לכן האקראיות
 * כאן היא מה שמחליף סיסמה, ואורך קצר יותר היה הופך ניחוש לאפשרי בקישור
 * שנשלח לאלפי משפחות.
 */
export function newInviteToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * האם ההזמנה תקפה לשימוש עכשיו.
 *
 * ⚠️ סדר הבדיקות אינו שרירותי — הוא נבחר לפי מה שנכון *לומר* למשפחה:
 * "כבר נוצל" קודם ל"פג תוקף", כי משפחה שנרשמה בהצלחה ולוחצת שוב על הקישור
 * צריכה לשמוע שהרישום נקלט — ולא שהקישור פג, שנשמע ככישלון ומייצר פנייה.
 *
 * @param distributionId החלוקה שאליה מנסים להירשם עכשיו. ההזמנה נעולה לחלוקה
 *   מסוימת, כדי שקישור מפסח לא ישמש לרישום לתשרי.
 */
export function checkInvite(
  invite: InviteRow | null | undefined,
  now: Date,
  distributionId?: string | null,
): InviteVerdict {
  if (!invite) return { ok: false, reason: 'not-found' }
  if (invite.used_at) return { ok: false, reason: 'used' }
  if (invite.revoked_at) return { ok: false, reason: 'revoked' }

  const exp = new Date(invite.expires_at)
  // ⚠️ תאריך תפוגה פגום נחשב פג, ולא תקף. ברירת מחדל לטובת הפותח הייתה
  // הופכת שורה פגומה לקישור נצחי.
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' }
  }

  if (distributionId && invite.distribution_id !== distributionId) {
    return { ok: false, reason: 'wrong-distribution' }
  }
  return { ok: true }
}

/**
 * מועד תפוגה מברירת מחדל של ימים.
 *
 * ⚠️ מוגבל לטווח שפוי: תפוגה של שנים היא חור קבוע במתג הסגירה, וכזה שאיש
 * לא זוכר שקיים.
 */
export const MAX_INVITE_DAYS = 60
export function inviteExpiry(now: Date, days: number): string {
  const d = Math.min(Math.max(Math.floor(days) || 1, 1), MAX_INVITE_DAYS)
  return new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString()
}
