// ─────────────────────────────────────────────────────────────────────────────
// בדיקות הזיהוי במסלול הרישום הטלפוני (חנוכה תשפ״ז ואילך) — לוגיקה טהורה.
//
// 🔴 הרישום בטלפון אינו "מקש אחד": המתקשר מקיש ת"ז, תאריך לידה ומספר טלפון,
// ושלושתם חייבים להתאים לכרטסת. כך הרישום מחייב, ומי שמכיר רק ת"ז של
// אחר אינו יכול לרשום אותו.
// ─────────────────────────────────────────────────────────────────────────────
import { isKnownPhone } from '@/lib/cardIdentity'
import { isMarried } from '@/lib/aidApplyValidation'

export type BirthCheck = 'match' | 'mismatch' | 'unknown'

/** YYYYMMDD מתאריך שמור ("1990-03-15", "1990-03-15T00:00", "15/03/1990", "15.03.1990"). */
export function storedBirthKey(stored: string | null | undefined): string | null {
  const s = String(stored ?? '').trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s)
  if (m) return `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}`
  return null
}

/** YYYYMMDD מהקשה בטלפון: 8 ספרות בסדר יום-חודש-שנה (15031990). */
export function typedBirthKey(typed: string | null | undefined): string | null {
  const d = String(typed ?? '').replace(/\D/g, '')
  if (d.length !== 8) return null
  const day = Number(d.slice(0, 2)), month = Number(d.slice(2, 4)), year = Number(d.slice(4))
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > 2100) return null
  return `${d.slice(4)}${d.slice(2, 4)}${d.slice(0, 2)}`
}

/**
 * השוואת תאריך הלידה שהוקש לרשום.
 *
 * ⚠️ 'unknown' כשאין תאריך שמור (או שאינו קריא): חסימה הייתה נועלת בחוץ
 * משפחות זכאיות רק בגלל שדה חסר בכרטסת. במקרה כזה הזיהוי נשען על הת"ז
 * ועל מספר הטלפון, ששניהם נבדקים בנפרד.
 */
export function checkBirthDate(typed: string | null | undefined, stored: string | null | undefined): BirthCheck {
  const s = storedBirthKey(stored)
  if (!s) return 'unknown'
  const t = typedBirthKey(typed)
  return t && t === s ? 'match' : 'mismatch'
}

/**
 * השוואה מול כמה תאריכים אפשריים (נשואים: של האב או של האם).
 * 'unknown' רק כשאין אף תאריך שמור קריא.
 */
export function checkBirthDateAny(typed: string | null | undefined, stored: (string | null | undefined)[]): BirthCheck {
  const keys = stored.map(storedBirthKey).filter((k): k is string => !!k)
  if (!keys.length) return 'unknown'
  const t = typedBirthKey(typed)
  return t && keys.includes(t) ? 'match' : 'mismatch'
}

/** האם התאריך שהמתקשר מתבקש להקיש הוא "של האבא או האמא" (סטטוס נשואים). */
export function asksParentBirth(m: { marital_status?: string | null }): boolean {
  return isMarried(String(m.marital_status ?? ''))
}

/**
 * הכרעת תאריך הלידה לפי הסטטוס.
 *
 * 🔴 נשואים מתבקשים "תאריך הלידה של האבא או האמא" ⇒ כל אחד משני התאריכים
 * שבכרטסת מתקבל. אחרים ⇒ תאריך הלידה של בעל הת"ז שהוקשה.
 */
export function checkRegistrantBirth(
  typed: string | null | undefined, typedId: string,
  m: { marital_status?: string | null; id_number?: string | null; spouse_id_number?: string | null; birth_date?: string | null; spouse_birth_date?: string | null },
): BirthCheck {
  if (asksParentBirth(m)) return checkBirthDateAny(typed, [m.birth_date, m.spouse_birth_date])
  return checkBirthDate(typed, birthDateForId(typedId, m))
}

/** תאריך הלידה הרלוונטי: של בעל הת"ז שהוקשה (הנרשם או בן/בת הזוג). */
export function birthDateForId(
  typedId: string,
  m: { id_number?: string | null; spouse_id_number?: string | null; birth_date?: string | null; spouse_birth_date?: string | null },
): string | null {
  const id = typedId.replace(/\D/g, '').replace(/^0+/, '')
  const spouse = String(m.spouse_id_number ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (spouse && spouse === id) return m.spouse_birth_date ?? null
  return m.birth_date ?? null
}

/** האם מספר הטלפון שהוקש הוא אחד המספרים הרשומים בכרטסת. */
export function phoneMatches(
  typed: string | null | undefined,
  m: { phone?: string | null; phone2?: string | null; spouse_phone?: string | null },
): boolean {
  return isKnownPhone(typed, [m.phone, m.phone2, m.spouse_phone])
}
