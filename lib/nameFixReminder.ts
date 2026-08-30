// ─────────────────────────────────────────────────────────────────────────────
// מי מקבל תזכורת שבועית להשלמת שם התינוק.
//
// 🔴 רק תיקים שהיולדת סימנה בהם "עדיין אין שם". תיק שיש בו שם — גם אם הדגל
// נשאר דלוק בטעות — אינו מקבל תזכורת: היולדת כבר עשתה את שלה, ומייל נוסף
// הוא הטרדה. לכן הבדיקה עוברת דרך isNamePending (דגל *וגם* היעדר שם בפועל)
// ולא דרך baby_name_pending הגולמי.
//
// המודול טהור — בוחר רשימה ולא שולח דבר. כך אפשר לבדוק את כללי הבחירה בלי
// מסד ובלי מייל.
// ─────────────────────────────────────────────────────────────────────────────
import { babiesOf, isNamePending, type AidNameFields } from './babyNames'

/**
 * חסר שם לפחות לתינוק אחד בתיק.
 *
 * ⚠️ isNamePending לבדה אינה מספיקה לתאומים: היא נשענת על babyRealName,
 * שמחזירה שם ברגע ש*תאום אחד* קיבל שם. תיק שבו תאום אחד נקרא והשני עדיין
 * לא היה נחשב "מושלם" ומפסיק לקבל תזכורות — בדיוק המצב שיצר במסד שלושה
 * תיקים עם תאום אחד בלי שם.
 */
function someBabyMissingName(aid: AidNameFields): boolean {
  const list = babiesOf(aid)
  if (list.length > 1) return list.some(b => !String(b.name ?? '').trim())
  return isNamePending(aid)
}

/**
 * תקרת התזכורות למשפחה.
 *
 * ⚠️ בלי תקרה משפחה שלא משלימה את השם מקבלת מייל כל שבוע לנצח — הדרך
 * הבטוחה לסימון כספאם, שגורר את *כל* מיילי המערכת לתיקיית הזבל ולא רק
 * את התזכורת. אחרי 4 שבועות המערכת מפסיקה; המזכירות עדיין יכולה לשלוח ידנית.
 */
export const MAX_NAME_REMINDERS = 4

/** מרווח מינימלי בין תזכורות — שבוע. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// ⚠️ מעט פחות משבוע: ה-cron רץ בשעה קבועה, ועיכוב של דקות בהרצה היה דוחה
// כל תיק בשבוע שלם. 6 ימים ו-12 שעות סופגים את הסטייה בלי לכפול שליחה.
const MIN_GAP_MS = WEEK_MS - 12 * 60 * 60 * 1000

export interface ReminderRow extends AidNameFields {
  id: string
  name_reminder_sent_at?: string | null
  name_reminder_count?: number | null
  /** כתובת המייל של היולדת (מפורקת מהג'וין לפני הקריאה). */
  email?: string | null
}

/**
 * התיקים שאמורים לקבל תזכורת עכשיו.
 *
 * התנאים, כולם נדרשים:
 *   1. מסומן "עדיין אין שם" ואין שם בפועל (isNamePending)
 *   2. יש כתובת מייל
 *   3. טרם נשלחה תזכורת, או שעבר שבוע מהאחרונה
 *   4. לא עברה תקרת התזכורות
 */
export function selectNameReminderTargets(rows: ReminderRow[], now: Date): ReminderRow[] {
  return rows.filter(r => {
    // ⚠️ הדגל הוא התנאי הראשון: תיק שלא סומן "עדיין אין שם" אינו בתהליך
    // הזה כלל, גם אם במקרה חסר בו שם.
    if (r.baby_name_pending !== true) return false
    if (!someBabyMissingName(r)) return false
    if (!(r.email ?? '').trim()) return false
    if ((r.name_reminder_count ?? 0) >= MAX_NAME_REMINDERS) return false

    const last = r.name_reminder_sent_at ? Date.parse(r.name_reminder_sent_at) : NaN
    // ⚠️ תאריך פגום נחשב "טרם נשלח" ולא חוסם: עדיף תזכורת אחת מיותרת
    // מאשר תיק שנתקע בשקט ולא מקבל תזכורת לעולם.
    if (Number.isNaN(last)) return true
    return now.getTime() - last >= MIN_GAP_MS
  })
}
