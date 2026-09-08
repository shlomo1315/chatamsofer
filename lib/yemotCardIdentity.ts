import { normalizePhone } from '@/lib/phone'

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי המתקשר לפני שיוך כרטיס בשלוחת החגים.
//
// 🔴 הכלל: מספר המתקשר הוא הזיהוי — אותו רעיון כמו בשלוחת היולדות
// (app/api/webhooks/yemot-maternity), שם המתקשר אינו מקיש ת"ז כלל
// והמשפחה נמצאת לפי ApiPhone מול phone / phone2 / spouse_phone.
//
// ⚠️ ת"ז אינה ראיה. היא מופיעה על כל מסמך, ושיוך כרטיס הוא פעולה כספית
// שאי אפשר לבטל בטלפון. לכן ת"ז לעולם אינה *פותחת* את המסלול — היא
// משמשת רק להכרעה בין משפחות שכבר הוכחו שייכות לאותו מספר.
//
// ⚠️ תאריך לידה בוטל כדרך אימות. מי שמתקשר ממספר שאינו רשום נחסם ושומע
// זאת מפורשות, במקום להיות מנותב לאימות חלופי.
//
// 🔴 הטלפון המשותף — הסיבה שהמודול הזה קיים בכלל:
// 82 מספרים בחלוקת תשרי רשומים אצל יותר ממשפחה אחת (172 משפחות; מספר
// אחד מוביל ל-6). ביולדות "ההתאמה הראשונה" מספיקה כי היא רק *שולפת* תיק;
// כאן היא הייתה משייכת כרטיס טעון למשפחה הלא נכונה. לכן ריבוי התאמות
// אינו נפתר בניחוש אלא בהקשת ת"ז — מצומצמת לאותן משפחות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

/** משפחה מועמדת — כל מה שנדרש כדי להכריע בין כמה על אותו מספר. */
export interface PhoneCandidate {
  id: string
  id_number: string | null | undefined
}

export type CardIdentityResult =
  /** מספר מוכר ומשפחה אחת בלבד — אפשר לשייך מיד, בלי הקשה. */
  | { ok: true; via: 'phone'; familyId: string }
  /** ת"ז שהוקשה הכריעה בין כמה משפחות על אותו מספר. */
  | { ok: true; via: 'phone_and_id'; familyId: string }
  /** המספר אינו רשום באף כרטסת. */
  | { ok: false; reason: 'phone_unknown' }
  /** המספר משויך לכמה משפחות — נדרשת ת"ז להכרעה. */
  | { ok: false; reason: 'need_id_choice' }
  /** הת"ז שהוקשה אינה שייכת לאף אחת ממשפחות המספר. */
  | { ok: false; reason: 'id_not_on_phone' }

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
 * מכריע את המשפחה שעבורה ישויך הכרטיס.
 *
 * @param candidates המשפחות שהמספר של המתקשר רשום אצלן (כבר סוננו לפי טלפון).
 * @param typedId    ת"ז שהוקשה, אם הוקשה — רלוונטית רק כשיש יותר ממועמדת אחת.
 */
export function resolveCardFamily(
  candidates: PhoneCandidate[],
  typedId?: string | null,
): CardIdentityResult {
  // ⚠️ נכשל-סגור: בלי מספר מוכר אין שיוך, ואין מסלול עוקף.
  if (!candidates.length) return { ok: false, reason: 'phone_unknown' }

  // המקרה הרגיל (5,935 מתוך 6,107) — משפחה אחת, בלי שום הקשה.
  if (candidates.length === 1) {
    return { ok: true, via: 'phone', familyId: candidates[0].id }
  }

  const typed = String(typedId ?? '').replace(/\D/g, '')
  if (!typed) return { ok: false, reason: 'need_id_choice' }

  // ⚠️ ההשוואה מרופדת באפסים משני הצדדים: ת"ז נשמרת לעתים בלי אפס מוביל,
  // והמתקשר מקיש 9 ספרות מלאות. בלי זה התאמה אמיתית הייתה נכשלת.
  const norm = (s: string) => s.replace(/\D/g, '').padStart(9, '0')
  const want = norm(typed)
  const hit = candidates.find(c => {
    const cid = String(c.id_number ?? '').replace(/\D/g, '')
    return cid.length > 0 && norm(cid) === want
  })

  // ⚠️ ההכרעה מצומצמת למשפחות של אותו מספר בלבד. ת"ז של משפחה אחרת —
  // גם אם היא קיימת במערכת — אינה פותחת כאן דבר.
  return hit
    ? { ok: true, via: 'phone_and_id', familyId: hit.id }
    : { ok: false, reason: 'id_not_on_phone' }
}
