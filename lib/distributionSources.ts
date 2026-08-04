// ─────────────────────────────────────────────────────────────────────────────
// ערוצי רישום — טיפוס ותוויות.
//
// ⚠️ אותם ערוצים משרתים גם את ההרשמה לאיגוד (beneficiaries.registration_source)
// וגם את הרישום לחלוקת חגים (distribution_recipients.source). רשימה אחת בכוונה:
// שתי רשימות היו מתפצלות בתווית הראשונה שמישהו ישנה, ואז אותו ערוץ היה מוצג
// בשני שמות בשני מסכים.
//
// ⚠️ בקובץ נפרד: lib/holidayDistributions נוגע ב-Supabase דרך apiAuth (שמייבא
// next/headers, כלומר שרת בלבד), ורכיבי הלקוח צריכים רק את התוויות. ייבוא
// מהמודול השרתי היה מגרר את כל הצד השרתי לבאנדל של הדפדפן ושובר את הבילד.
// ─────────────────────────────────────────────────────────────────────────────
export type RegisterSource = 'portal' | 'phone' | 'email' | 'nedarim' | 'admin'

export const SOURCE_LABEL: Record<RegisterSource, string> = {
  portal: 'ממשק דיגיטלי',
  phone: 'טלפון',
  email: 'מייל',
  nedarim: 'נדרים פלוס',
  admin: 'הזנה ידנית',
}

/** תווית ההרשמה לאיגוד — מנוסחת כ"איך נרשם", לכן "רישום באתר" ולא "ממשק". */
export const REGISTRATION_SOURCE_LABEL: Record<RegisterSource, string> = {
  portal: 'רישום באתר',
  phone: 'רישום טלפוני',
  email: 'רישום במייל',
  nedarim: 'טופס נדרים פלוס',
  admin: 'הזנה ידנית במשרד',
}

/**
 * נרמול הערך מהמסד לערוץ מוכר — null כשאין או כשאינו מוכר.
 *
 * ⚠️ ערך לא מוכר מוחזר כ-null ולא מוצג כמו-שהוא: רשומות מלפני העמודה יציגו
 * "לא תועד", וזה נכון יותר מלנחש להן ערוץ.
 */
export function registrationSourceOf(v: unknown): RegisterSource | null {
  const s = String(v ?? '').trim()
  return s in REGISTRATION_SOURCE_LABEL ? (s as RegisterSource) : null
}

/** התווית להצגה, כולל המצב שבו לא תועד ערוץ. */
export function registrationSourceLabel(v: unknown): string {
  const s = registrationSourceOf(v)
  return s ? REGISTRATION_SOURCE_LABEL[s] : 'לא תועד'
}
