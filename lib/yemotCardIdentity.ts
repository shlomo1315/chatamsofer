import { normalizePhone } from '@/lib/phone'

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי המתקשר לפני שיוך כרטיס בשלוחה.
//
// 🔴 שיוך כרטיס הוא פעולה כספית: הוא קושר כרטיס נטען למשפחה, ואי אפשר
// לבטלו בטלפון. ת"ז לבדה אינה סוד — היא מופיעה על כל מסמך — ולכן היא
// אינה מספיקה כדי לאשר את הפעולה.
//
// שתי דרכי זיהוי:
//   1. המתקשר מתקשר **מטלפון הרשום בכרטסת** — זיהוי מיידי. השליטה במספר
//      היא הראיה, בדיוק כמו קוד שנשלח ב-SMS.
//   2. מטלפון אחר — נדרש **תאריך לידה** (8 ספרות). מי שיודע ת"ז אך לא
//      תאריך לידה אינו בן הבית.
//
// ⚠️ מתקבל תאריך הלידה של הבעל **או** של האישה. 126 משפחות חסר להן אחד
// מהשניים במערכת, וחובת שניהם הייתה נועלת אותן מחוץ למערכת.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardIdentityState {
  /** הטלפונים הרשומים בכרטסת: בעל, אישה, נוסף. */
  phones: (string | null | undefined)[]
  /** תאריכי הלידה הרשומים (ISO), אם קיימים. */
  birthDates: (string | null | undefined)[]
}

export type IdentityResult =
  /** הטלפון מוכר — אפשר לשייך מיד. */
  | { ok: true; via: 'phone' }
  /** תאריך הלידה שהוקש תואם — אפשר לשייך. */
  | { ok: true; via: 'birth_date' }
  /** נדרש תאריך לידה (המתקשר אינו מטלפון מוכר). */
  | { ok: false; reason: 'need_birth_date' }
  /** התאריך שהוקש אינו תואם. */
  | { ok: false; reason: 'birth_date_mismatch' }
  /** אין בכרטסת אף תאריך לידה — אי אפשר לאמת בטלפון. */
  | { ok: false; reason: 'no_birth_date_on_file' }

/**
 * המרת ISO ל-8 ספרות כפי שהמתקשר מקיש: DDMMYYYY.
 *
 * ⚠️ סדר ישראלי (יום-חודש-שנה) ולא ISO — זה מה שאדם מקיש כשמבקשים ממנו
 * תאריך לידה.
 */
export function isoToDigits(iso: string | null | undefined): string | null {
  const s = String(iso ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  return `${m[3]}${m[2]}${m[1]}`
}

/** האם המספר שהתקשר ממנו מוכר בכרטסת. */
export function isKnownPhone(
  callerPhone: string | null | undefined,
  phones: (string | null | undefined)[],
): boolean {
  const caller = normalizePhone(callerPhone)
  // ⚠️ מספר קצר מדי אינו "מוכר" — שיחה בלי זיהוי מתקשר מגיעה כערך ריק
  // או קטוע, ואסור לה לעבור כהתאמה.
  if (caller.length < 9) return false
  return phones.some(p => {
    const n = normalizePhone(p)
    return n.length >= 9 && n === caller
  })
}

/**
 * מכריע אם המתקשר מזוהה מספיק כדי לשייך כרטיס.
 *
 * @param typedDigits 8 הספרות שהוקשו, אם הוקשו.
 */
export function checkCardIdentity(
  state: CardIdentityState,
  callerPhone: string | null | undefined,
  typedDigits?: string | null,
): IdentityResult {
  // 1. טלפון מוכר — גובר על הכול, ואין צורך בהקשה נוספת.
  if (isKnownPhone(callerPhone, state.phones)) return { ok: true, via: 'phone' }

  const expected = state.birthDates
    .map(isoToDigits)
    .filter((d): d is string => !!d)

  // ⚠️ אין במה לאמת. נכשל-סגור: עדיף לשלוח למשרד מאשר לשייך בלי זיהוי.
  if (!expected.length) return { ok: false, reason: 'no_birth_date_on_file' }

  const typed = String(typedDigits ?? '').replace(/\D/g, '')
  if (!typed) return { ok: false, reason: 'need_birth_date' }
  // ⚠️ אורך שגוי נחשב אי-התאמה ולא "טרם הוקש": המתקשר כן הקיש משהו,
  // וההודעה הנכונה היא שהתאריך אינו נכון.
  if (typed.length !== 8) return { ok: false, reason: 'birth_date_mismatch' }

  return expected.includes(typed)
    ? { ok: true, via: 'birth_date' }
    : { ok: false, reason: 'birth_date_mismatch' }
}
