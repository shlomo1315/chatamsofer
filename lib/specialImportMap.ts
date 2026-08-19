// ─────────────────────────────────────────────────────────────────────────────
// זיהוי אוטומטי של עמודות בקובץ אקסל של מאושרים חריגים.
//
// הבעיה: הקבצים מגיעים ממקורות שונים ואין להם כותרות אחידות. "ת.ז", "תז",
// "מספר זהות" ו-"ID" הם אותו שדה, ומשתמש שנדרש למפות 12 עמודות ביד בכל
// קובץ פשוט לא ישתמש בייבוא.
//
// ⚠️ הזיהוי מנרמל את הכותרת (גרשיים, נקודות, רווחים) לפני ההשוואה: "ת.ז",
// "ת״ז" ו-"ת ז" נראים שונה למחשב וזהים לאדם.
//
// ⚠️ סדר החיפוש חשוב: התאמה מדויקת קודמת להכלה. בלעדיה "שם בן/בת הזוג"
// היה נתפס ע"י הכלל של "שם" ונכנס לעמודה הלא נכונה — הבעיה הכי מסוכנת
// בייבוא, כי היא שקטה ונראית כאילו הצליחה.
// ─────────────────────────────────────────────────────────────────────────────

export type FieldKey =
  | 'full_name' | 'family_name' | 'spouse_name'
  | 'id_number' | 'spouse_id_number'
  | 'phone' | 'email' | 'address' | 'city' | 'apartment'
  | 'marital_status' | 'birth_date' | 'notes'

export interface FieldDef {
  key: FieldKey
  label: string
  /** שדה שבלעדיו אי אפשר ליצור רשומה. */
  required?: boolean
  /** כותרות מדויקות (אחרי נרמול). */
  exact: string[]
  /** מילות מפתח להתאמה חלקית — נבדקות רק אם אין התאמה מדויקת. */
  contains?: string[]
}

/** נרמול כותרת: הסרת גרשיים, נקודות, רווחים כפולים ורווחים בקצוות. */
export function normalizeHeader(raw: string): string {
  return String(raw ?? '')
    .replace(/["'׳״`]/g, '')
    .replace(/[.\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export const FIELDS: FieldDef[] = [
  {
    key: 'id_number', label: 'תעודת זהות', required: true,
    exact: ['תז', 'ת ז', 'תעודת זהות', 'מספר זהות', 'מס זהות', 'id', 'id number', 'תז מבקש'],
    contains: ['תעודת זהות', 'מספר זהות'],
  },
  {
    key: 'full_name', label: 'שם פרטי', required: true,
    exact: ['שם', 'שם פרטי', 'שם המבקש', 'שם מלא', 'first name', 'name'],
    contains: ['שם פרטי', 'שם המבקש'],
  },
  {
    key: 'family_name', label: 'שם משפחה',
    exact: ['משפחה', 'שם משפחה', 'family', 'last name', 'surname'],
    contains: ['שם משפחה'],
  },
  {
    key: 'spouse_name', label: 'שם בן/בת הזוג',
    exact: ['שם האישה', 'שם אישה', 'שם הבעל', 'בן זוג', 'בת זוג', 'שם בן הזוג', 'שם בת הזוג', 'spouse'],
    contains: ['בן זוג', 'בת זוג', 'האישה', 'הבעל'],
  },
  {
    key: 'spouse_id_number', label: 'ת.ז בן/בת הזוג',
    // ⚠️ שתי הצורות — "תז" ו-"ת ז": normalizeHeader הופך נקודה לרווח, ולכן
    // "ת.ז אישה" נעשה "ת ז אישה" בעוד "ת״ז אישה" נעשה "תז אישה".
    exact: [
      'תז אישה', 'תז בן זוג', 'תז בת זוג', 'תז הבעל', 'spouse id',
      'ת ז אישה', 'ת ז בן זוג', 'ת ז בת זוג', 'ת ז הבעל',
    ],
    contains: ['תז אישה', 'תז בן זוג', 'תז בת זוג', 'ת ז אישה', 'ת ז בן זוג', 'ת ז בת זוג'],
  },
  {
    key: 'phone', label: 'טלפון',
    exact: ['טלפון', 'נייד', 'פלאפון', 'מספר טלפון', 'phone', 'mobile', 'tel'],
    contains: ['טלפון', 'נייד'],
  },
  {
    key: 'email', label: 'דוא"ל',
    exact: ['מייל', 'אימייל', 'דואל', 'דוא ל', 'email', 'mail', 'e mail'],
    contains: ['מייל', 'email'],
  },
  {
    key: 'city', label: 'עיר',
    exact: ['עיר', 'ישוב', 'יישוב', 'city'],
    contains: ['עיר', 'ישוב'],
  },
  {
    key: 'address', label: 'כתובת',
    exact: ['כתובת', 'רחוב', 'address', 'street'],
    contains: ['כתובת', 'רחוב'],
  },
  {
    key: 'apartment', label: 'דירה',
    exact: ['דירה', 'מספר דירה', 'apt', 'apartment'],
    contains: ['דירה'],
  },
  {
    key: 'marital_status', label: 'מצב משפחתי',
    exact: ['מצב משפחתי', 'סטטוס', 'marital'],
    contains: ['מצב משפחתי'],
  },
  {
    key: 'birth_date', label: 'תאריך לידה',
    exact: ['תאריך לידה', 'לידה', 'birth', 'birth date', 'dob'],
    contains: ['תאריך לידה'],
  },
  {
    key: 'notes', label: 'הערות',
    exact: ['הערות', 'הערה', 'notes', 'comment'],
    contains: ['הערות'],
  },
]

/**
 * ממפה כותרות מהקובץ לשדות המערכת.
 *
 * @returns מיפוי index→FieldKey. עמודה שלא זוהתה פשוט נעדרת מהמיפוי.
 *
 * ⚠️ שדה שכבר שובץ אינו נלקח שוב: קובץ עם "שם" וגם "שם מלא" היה ממפה
 * את שניהם ל-full_name, והשני היה דורס את הראשון בשקט.
 */
export function autoMapColumns(headers: string[]): Record<number, FieldKey> {
  const map: Record<number, FieldKey> = {}
  const used = new Set<FieldKey>()
  const norm = headers.map(normalizeHeader)

  // סבב 1 — התאמות מדויקות בלבד (מדויק גובר על חלקי, ראו הערת הפתיחה).
  for (const f of FIELDS) {
    if (used.has(f.key)) continue
    const i = norm.findIndex((h, idx) => map[idx] === undefined && h !== '' && f.exact.includes(h))
    if (i >= 0) { map[i] = f.key; used.add(f.key) }
  }

  // סבב 2 — הכלה, רק למה שנותר.
  for (const f of FIELDS) {
    if (used.has(f.key) || !f.contains?.length) continue
    const i = norm.findIndex((h, idx) =>
      map[idx] === undefined && h !== '' && f.contains!.some(c => h.includes(c)))
    if (i >= 0) { map[i] = f.key; used.add(f.key) }
  }

  return map
}

/** השדות שחובה למצוא כדי שהייבוא יוכל לרוץ. */
export function missingRequired(map: Record<number, FieldKey>): FieldKey[] {
  const found = new Set(Object.values(map))
  return FIELDS.filter(f => f.required && !found.has(f.key)).map(f => f.key)
}

/**
 * מנקה ערך ת"ז: מסיר כל מה שאינו ספרה ומשלים ל-9 באפסים מובילים.
 *
 * ⚠️ אקסל מפיל אפסים מובילים ממספרים — "012345678" נשמר כ-12345678.
 * בלי ההשלמה הזו הת"ז לא הייתה מתאימה לרשומה קיימת, וכל שורה כזו
 * הייתה נכנסת כאדם חדש במקום לעדכן את הקיים.
 */
export function cleanIdNumber(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.length < 9 ? digits.padStart(9, '0') : digits
}

/** ניקוי טלפון — ספרות בלבד, עם שמירה על קידומת בינלאומית. */
export function cleanPhone(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const plus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')
  return plus ? `+${digits}` : digits
}
