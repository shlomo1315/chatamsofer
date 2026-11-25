// שם המשפחה בכל המיילים של "לכבוד משפחת ..." (חלוקת חגים, סדר הדורות, הלוואות).
// ⚠️ בכרטסת full_name הוא השם הפרטי של הבעל (או של הנרשם/ת היחיד/ה) ו-spouse_name
// של האשה. אצל נשואים מציגים את שניהם: "פרנקל מנחם מענדיל ופייגא". הצגת שם
// האשה לבד גרמה למשפחות לחשוב שהבקשה נרשמה על שמה בלבד.

export type HolidayNameSource = {
  family_name?: string | null
  full_name?: string | null
  spouse_name?: string | null
  marital_status?: string | null
} | null | undefined

const MARRIED = new Set(['נשואים', 'נשוי', 'נשואה'])

/** השמות הפרטיים: "מנחם מענדיל ופייגא" אצל נשואים, אחרת השם הפרטי של הנרשם. */
export function holidayFirstNames(b: HolidayNameSource): string {
  const husband = (b?.full_name ?? '').trim()
  const wife = (b?.spouse_name ?? '').trim()
  const status = (b?.marital_status ?? '').trim()
  // בלי מצב משפחתי ברשומה, שני שמות פרטיים מעידים על זוג.
  const married = MARRIED.has(status) || (!status && !!husband && !!wife)
  if (married && husband && wife) return `${husband} ו${wife}`
  // 🔴 לעולם לא שם האשה לבד (בקשת שלמה 25.11): spouse_name קיים רק אצל זוג,
  // ובלי שם הבעל מציגים משפחה בלבד. אלמנה/רווקה רשומה ב-full_name.
  return husband
}

/** משפחה ואז השמות הפרטיים: "פרנקל מנחם מענדיל ופייגא". */
export function holidayFamilyName(b: HolidayNameSource): string {
  return [(b?.family_name ?? '').trim(), holidayFirstNames(b)].filter(Boolean).join(' ')
}
