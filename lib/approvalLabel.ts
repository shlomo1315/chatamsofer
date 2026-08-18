// ─────────────────────────────────────────────────────────────────────────────
// נרמול תווית סיבת האישור מתוך תוצאת השאילתה.
//
// התווית נשלפת ב-join מקונן (`approval_label:approval_labels(...)`) בכל מסך
// שמציג בקשת הטבה. PostgREST מחזיר את ה-join הזה **לפעמים כאובייקט ולפעמים
// כמערך בן-איבר**, תלוי באיך הוא הסיק את יחס המפתח הזר. שני המקרים תקינים
// מבחינתו, ולכן קוד שקורא `b.approval_label.name` ישירות עובד במסך אחד
// ומחזיר undefined במסך אחר — בלי שגיאה ובלי סימן.
//
// ⚠️ הפונקציה לעולם לא זורקת. אם ה-join נכשל (המיגרציה טרם רצה), אם העמודה
// חסרה, או אם התקבל ערך לא צפוי — היא מחזירה null, ו-ApprovalLabelTag פשוט
// לא מרנדר דבר. תווית חסרה אינה סיבה להפיל מסך של בקשת הטבה.
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalLabel } from '@/types'

/** מחלץ תווית יחידה מכל צורה שה-join עשוי להחזיר. null = אין תווית. */
export function approvalLabelOf(row: unknown): ApprovalLabel | null {
  if (!row || typeof row !== 'object') return null
  const raw = (row as { approval_label?: unknown }).approval_label
  // מערך בן-איבר (יחס שהוסק כ"רבים") או אובייקט בודד — שניהם מתקבלים.
  const one = Array.isArray(raw) ? raw[0] : raw
  if (!one || typeof one !== 'object') return null
  const l = one as { id?: unknown; name?: unknown; color?: unknown; notes?: unknown }
  // ⚠️ שם ריק נחשב לחוסר תווית: רשומה פגומה לא אמורה לצייר תג ריק בשורה.
  if (typeof l.name !== 'string' || !l.name.trim()) return null
  return {
    id: String(l.id ?? ''),
    name: l.name,
    color: typeof l.color === 'string' ? l.color : null,
    notes: typeof l.notes === 'string' ? l.notes : null,
  }
}

/**
 * קטע ה-select של ה-join — מקור אמת יחיד לכל המסכים.
 * ⚠️ שינוי כאן משנה את כל השאילתות יחד; שכפול הטקסט היה מוביל למסך אחד
 * ששולף `notes` ולאחר שאינו, ולתג שההסבר שלו מופיע רק בחלק מהמקומות.
 */
export const APPROVAL_LABEL_SELECT = 'approval_label:approval_labels(id, name, color, notes)'
