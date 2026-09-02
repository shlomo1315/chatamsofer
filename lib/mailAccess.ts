import type { SupabaseClient } from '@supabase/supabase-js'
import { allowedMailboxKeys, type StaffContext } from '@/lib/apiAuth'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

// ─────────────────────────────────────────────────────────────────────────────
// אכיפת בעלות-מחלקה על פעולות מייל (מחיקה/סימון/העברה/שיוך).
// עד היום פעולות אלו פעלו לפי messageId בלבד — כל איש צוות יכול היה לגעת
// במייל של כל מחלקה (IDOR). ה-helper מאמת שהמייל שייך לאחת התיבות המורשות
// למשתמש, לפי אותם כללים כמו סינון הקריאה במסך המייל:
//   allowedMailboxKeys(staff): null = מנהל / ללא הגבלה · [] = חסום לגמרי · אחרת רשימת מפתחות.
// ─────────────────────────────────────────────────────────────────────────────

/** כתובות המייל של התיבות המורשות (מפתחות → אימיילים). null = ללא הגבלה. */
export function allowedMailboxEmails(staff: StaffContext): string[] | null {
  const keys = allowedMailboxKeys(staff)
  if (keys === null) return null
  return keys.map(k => DEPARTMENTS[k as DepartmentKey]?.email).filter((e): e is string => !!e)
}

/**
 * האם המשתמש רשאי לגעת במייל נכנס מסוים? בודק מול ה-DB את to_email/department
 * של המייל ומשווה לתיבות המורשות.
 *   null   → מנהל / ללא הגבלה (תמיד מותר)
 *   []     → חסום לגמרי (תמיד אסור)
 *   keys   → מותר רק אם to_email או department של המייל שייכים לרשימה
 * מחזיר false גם אם המייל לא נמצא (fail-closed).
 */
export async function canAccessInboundMail(
  admin: SupabaseClient,
  staff: StaffContext,
  messageId: string,
): Promise<boolean> {
  const keys = allowedMailboxKeys(staff)
  if (keys === null) return true      // מנהל / ללא הגבלה
  if (keys.length === 0) return false // חסום לגמרי

  const { data: mail } = await admin
    .from('inbound_emails')
    .select('to_email, department')
    .eq('id', messageId)
    .maybeSingle()
  if (!mail) return false             // לא נמצא — נכשל סגור

  // התאמה לפי department (מפתח) או לפי to_email (כתובת התיבה) — כמו סינון הקריאה.
  const emails = allowedMailboxEmails(staff) ?? []
  const byDept = mail.department != null && keys.includes(String(mail.department))
  const byEmail = mail.to_email != null && emails.includes(String(mail.to_email))
  return byDept || byEmail
}

/** מסנן רשימת מזהי מיילים לאלה שהמשתמש מורשה לגעת בהם. */
export async function filterAccessibleInboundIds(
  admin: SupabaseClient,
  staff: StaffContext,
  ids: string[],
): Promise<string[]> {
  const keys = allowedMailboxKeys(staff)
  if (keys === null) return ids       // מנהל — הכול
  if (keys.length === 0) return []    // חסום

  const emails = allowedMailboxEmails(staff) ?? []
  const { data: rows } = await admin
    .from('inbound_emails')
    .select('id, to_email, department')
    .in('id', ids)
  return (rows ?? [])
    .filter(m => (m.department != null && keys.includes(String(m.department)))
      || (m.to_email != null && emails.includes(String(m.to_email))))
    .map(m => String(m.id))
}

// ─────────────────────────────────────────────────────────────────────────────
// אותה אכיפה בדיוק, על הודעות Gmail.
//
// 🔴 עץ /api/admin/gmail/** בדק requireMailAccess בלבד ולא קרא מעולם
// ל-allowedMailboxKeys: הסינון היחיד היה department/account מה-query string,
// כלומר פרמטר שהקורא שולט בו — לא מדיניות. מזכירת הלוואות שקראה ?folder=all
// קיבלה את התכתבות יולדות, אלמנות וסיוע רפואי, ושליפה לפי מזהה החזירה גוף
// וצירופים של כל הודעה בארגון (סריקות ת"ז).
//
// ⚠️ מקבילה ל-canAccessInboundMail ולא שימוש חוזר בה: הטבלאות שונות
// (gmail_messages מול inbound_emails) ומפתח הזיהוי שונה (gmail_message_id).
// ─────────────────────────────────────────────────────────────────────────────
export async function canAccessGmailMessage(
  admin: SupabaseClient,
  staff: StaffContext,
  gmailMessageId: string,
): Promise<boolean> {
  const keys = allowedMailboxKeys(staff)
  if (keys === null) return true      // מנהל / ללא הגבלה
  if (keys.length === 0) return false // חסום לגמרי

  const { data: mail } = await admin
    .from('gmail_messages')
    .select('to_email, original_to, department')
    .eq('gmail_message_id', gmailMessageId)
    .maybeSingle()
  if (!mail) return false             // לא נמצא — נכשל סגור

  // ⚠️ גם original_to: הודעה שהועברה לתיבה אחרת שומרת שם את היעד המקורי,
  // ולפיו נקבעת המחלקה במסך. התעלמות ממנו הייתה חוסמת גישה לגיטימית.
  const emails = allowedMailboxEmails(staff) ?? []
  const byDept = mail.department != null && keys.includes(String(mail.department))
  const byEmail = [mail.to_email, mail.original_to]
    .filter(Boolean)
    .some(e => emails.includes(String(e)))
  return byDept || byEmail
}

/**
 * בעלות-מחלקה על שרשור Gmail שלם.
 *
 * ⚠️ מספיק שהודעה **אחת** בשרשור שייכת לתיבה מורשית: תשובה שנשלחה מתיבה
 * אחרת אינה הופכת את השרשור לזר, ודרישה שכל ההודעות יתאימו הייתה חוסמת
 * התכתבות לגיטימית שעברה בין מחלקות.
 */
export async function canAccessGmailThread(
  admin: SupabaseClient,
  staff: StaffContext,
  threadId: string,
): Promise<boolean> {
  const keys = allowedMailboxKeys(staff)
  if (keys === null) return true
  if (keys.length === 0) return false

  const { data: rows } = await admin
    .from('gmail_messages')
    .select('to_email, original_to, department')
    .eq('thread_id', threadId)
  if (!rows?.length) return false     // לא נמצא — נכשל סגור

  const emails = allowedMailboxEmails(staff) ?? []
  return rows.some(m =>
    (m.department != null && keys.includes(String(m.department)))
    || [m.to_email, m.original_to].filter(Boolean).some(e => emails.includes(String(e))),
  )
}
