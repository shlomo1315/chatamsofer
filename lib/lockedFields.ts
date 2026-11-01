// שדות שאינם ניתנים לעריכה ישירה באזור האישי.
// ת"ז ודרכון: נעולים לגמרי (גם בקשת שינוי אינה קיימת). שם פרטי ושם משפחה: רק בבקשה שהמשרד מאשר (name-change).
export const FULLY_LOCKED_FIELDS = ['id_number', 'spouse_id_number', 'passport', 'passport_number', 'spouse_passport'] as const
export const APPROVAL_ONLY_FIELDS = ['full_name', 'family_name', 'spouse_name'] as const

export const LOCKED_FIELDS_MESSAGE = 'ת"ז, דרכון ושמות אינם ניתנים לעריכה ישירה. שינוי שם מתבצע בבקשה שמאושרת על ידי המשרד'

/** רשימת שדות נעולים שנשלחו בגוף הבקשה (ערך כלשהו, גם ריק). */
export function lockedFieldsInBody(body: Record<string, unknown>): string[] {
  return [...FULLY_LOCKED_FIELDS, ...APPROVAL_ONLY_FIELDS].filter(k => k in body && body[k] !== undefined)
}
