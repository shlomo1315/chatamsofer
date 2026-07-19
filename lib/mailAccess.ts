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
