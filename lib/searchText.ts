// ניקוי טקסט חיפוש ממה שהעין לא רואה.
//
// 🔴 22.11.2026: חיפוש ת"ז 123456782 במסך היולדות החזיר "לא נמצאו לידות",
// אף שהתיק קיים ומופיע ב"הכל". הסיבה: הת"ז הודבקה מוואטסאפ/מייל/אקסל יחד עם
// סימן כיווניות (U+200E/U+200F) בלתי נראה. התו נכנס לשדה, ה-includes נכשל,
// והמסך נראה תקין לחלוטין — המזכירה מסיקה שהתיק "לא קיים" ופותחת חדש.
//
// ⚠️ trim() אינו מסיר את התווים האלה — הם אינם רווח לבן לפי JS.

/** סימני כיווניות, תווים ברוחב אפס, BOM ומקף רך. */
export const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁩﻿­]/g

/** מסיר תווים בלתי נראים ומחליף רווח קשיח ברווח רגיל. */
export function stripInvisible(s: string): string {
  return String(s ?? '').replace(INVISIBLE_CHARS, '').replace(/ /g, ' ')
}

/** צורת השוואה לחיפוש חופשי: בלי תווים נסתרים, בלי רווחי קצה, אותיות קטנות. */
export function normalizeSearch(s: string): string {
  return stripInvisible(s).trim().toLowerCase()
}

/**
 * אם החיפוש הוא מספר (ת"ז, טלפון) — הספרות בלבד, בלי אפסים מובילים.
 * מכסה "123-456-782", "123 456 782" ו-"0123456782". אחרת null.
 * ⚠️ לפחות 4 ספרות — אחרת "12" יתאים לחצי מהרשימה.
 */
export function digitsQuery(s: string): string | null {
  const t = normalizeSearch(s)
  if (!/^[\d\s\-./]+$/.test(t)) return null
  const d = t.replace(/\D/g, '').replace(/^0+/, '')
  return d.length >= 4 ? d : null
}

/** מפתח השוואה לערך מספרי שמור (ת"ז/טלפון): ספרות בלבד, בלי אפסים מובילים. */
export function digitsKey(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').replace(/^0+/, '')
}
