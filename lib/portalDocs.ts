import { storagePath } from '@/lib/docUrl'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מסמך שמוטב מגיש בפורטל — חייב להיות שלו (ביקורת אבטחה 05.10).
//
// הבאג: בקשת הלוואה / לידה קיבלו מהדפדפן רשימת קישורי מסמכים כמות שהיא.
// השרת הוריד אותם עם service-role וצירף למייל לכתובת של המגיש. מוטב
// מחובר שהזין נתיב של משפחה אחרת (`<id אחר>/<קובץ>`) קיבל את המסמך שלה
// במייל — ת"ז, אישורי לידה.
//
// כל העלאה בפורטל נשמרת תחת `<מזהה המוטב>/…` (upload-docs,
// financial-aid-request). אומת במסד: 392/392 אישורי לידה מהפורטל ב-60
// הימים האחרונים יושבים תחת מזהה המוטב שלהם.
// ─────────────────────────────────────────────────────────────────────────────

export function isOwnDoc(urlOrPath: unknown, beneficiaryId: string): boolean {
  const raw = String(urlOrPath ?? '').trim()
  if (!raw || !beneficiaryId) return false
  const path = storagePath(raw)
  if (!path || path.includes('..')) return false
  // ⚠️ קישור חיצוני שאינו מהאחסון שלנו — לעולם לא שלו.
  if (/^https?:\/\//i.test(path)) return false
  return path.startsWith(`${beneficiaryId}/`)
}

/** מסנן רשימת מסמכים {url, name} למסמכים של המוטב בלבד. */
export function ownDocsOnly<T extends { url?: unknown }>(docs: unknown, beneficiaryId: string): T[] {
  if (!Array.isArray(docs)) return []
  return (docs as T[]).filter(d => d && isOwnDoc(d.url, beneficiaryId))
}
