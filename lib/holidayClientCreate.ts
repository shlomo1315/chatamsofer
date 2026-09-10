// ─────────────────────────────────────────────────────────────────────────────
// הקמת משפחה בנדרים לפני טעינת כרטיס החגים.
//
// 🔴 הפער שזה סוגר: loadOne רק *חיפשה* לקוח, ומשפחה שאינה קיימת בנדרים
// החזירה "לא נמצא לקוח בנדרים" — הכרטיס לא נטען, והמזכירות נדרשה להקים
// אותה ידנית מול מאות שורות.
//
// ⚠️ הכללים כאן אינם חדשים: הם אותם כללים שנלמדו ביולדות
// (lib/maternityCards) אחרי סדרת כשלים אמיתיים. הם מרוכזים כאן כדי
// שיהיו ניתנים לבדיקה בלי לקרוא לנדרים.
// ─────────────────────────────────────────────────────────────────────────────

import { isPassportId } from './nedarim'

/**
 * איזו ת"ז נשלחת להקמת המשפחה בנדרים.
 *
 * ⚠️ שתי הת"ז נבדקות ולא רק של הבעל: בחלק מהרשומות ת"ז הבעל ריקה, והקמה
 * לפי שדה יחיד נכשלה שם לגמרי.
 *
 * 🔴 ת"ז ישראלית מועדפת על דרכון: נדרים מחפש בעיקר לפי Zeout, ומשפחה
 * שהוקמה על דרכון בלבד (מזהה ג׳) קשה יותר לאיתור בהמשך — מה שמוביל
 * להקמה כפולה של אותה משפחה.
 */
export function pickZeoutForCreate(
  idNumber: string | null | undefined,
  spouseIdNumber: string | null | undefined,
): string | null {
  const candidates = [idNumber, spouseIdNumber]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
  if (!candidates.length) return null
  return candidates.find(v => !isPassportId({ id_number: v })) ?? candidates[0]
}

/**
 * האם השגיאה מנדרים היא "המשפחה כבר קיימת".
 *
 * 🔴 זו אינה שגיאה אלא בדיוק המצב שרצינו: יש שם לקוח עם אותה ת"ז.
 * ביולדות המקרה הזה עצר את ההטענה — החיפוש לא מצא (המשפחה רשומה על שם
 * בן/בת הזוג), ההקמה נדחתה, והכרטיס לא נטען למרות שהכל תקין.
 */
export function isAlreadyRegistered(message: string | null | undefined): boolean {
  const s = String(message ?? '')
  if (!s) return false
  return /כבר רשום|already (exists|registered)/i.test(s)
}

/**
 * האם השגיאה מנדרים אומרת "המזהה השמור אצלנו אינו מוכר".
 *
 * 🔴 המצב: nedarim_id ששמור בכרטסת הפך לא תקף — המשפחה אוחדה או נמחקה
 * בנדרים. AddTlush נכשל ב"שגיאה באיתור משפחה", והכרטיס אינו נטען.
 */
export function isUnknownClient(message: string | null | undefined): boolean {
  const s = String(message ?? '')
  if (!s) return false
  return /איתור משפחה|לא נמצא|not found/i.test(s)
}

/**
 * מה לעשות כשהמזהה השמור אינו מוכר: לחפש קודם, ורק אם אין — להקים.
 *
 * 🔴 הבאג שזה סוגר, מלוגי 10.09: הקוד קרא ישר להקמה (SaveClientCard בלי
 * ClientId), כלומר ביקש מנדרים משפחה *חדשה*. אבל המשפחה קיימת שם — רק
 * המזהה שלנו התיישן. נדרים דחו ב"מספר זהות זה כבר רשום אצל <אותה משפחה
 * בדיוק>", וההטענה נעצרה.
 *
 * ⚠️ זו הייתה לולאה סגורה שחזרה בכל ריצה: הטענה נכשלת → מנסה להקים →
 * נדחה כי כבר קיים → הכרטיס מוחזר למלאי → וחוזר חלילה. שלוש יולדות
 * (בלום, גולדשטין, פקשר) נתקעו בה חמש ריצות רצופות ולא קיבלו כרטיס.
 *
 * ⚠️ שתי הת"ז נבדקות — המשפחה בנדרים רשומה לעתים על שם בן/בת הזוג,
 * וחיפוש לפי אחת בלבד מחמיץ אותה בדיוק כשידוע שהיא שם.
 */
export function reviveLookupOrder(
  idNumber: string | null | undefined,
  spouseIdNumber: string | null | undefined,
): string[] {
  return [idNumber, spouseIdNumber].map(v => String(v ?? '').trim()).filter(Boolean)
}
