// עזרי לידה — ימי זכאות לבית החלמה + תינוקות (כולל תאומים)

// ברירת המחדל של ימי הזכאות בבית ההחלמה:
//   לידה רגילה = 2 ימים · לידת תאומים = 4 ימים.
export const SINGLE_RECOVERY_DAYS = 2
export const TWINS_RECOVERY_DAYS = 4

export function defaultRecoveryDays(isTwins?: boolean | null): number {
  return isTwins ? TWINS_RECOVERY_DAYS : SINGLE_RECOVERY_DAYS
}

// ימי הזכאות האפקטיביים לרשומה — הערך שנשמר, ובהיעדרו ברירת המחדל לפי סוג הלידה.
export function recoveryDaysOf(aid: { recovery_eligibility_days?: number | null; is_twins?: boolean | null }): number {
  return aid.recovery_eligibility_days ?? defaultRecoveryDays(aid.is_twins)
}

// ─── חלונות המימוש ───────────────────────────────────────────────────────────
// שני חלונות שונים, ואסור להחליף ביניהם:
//   כרטיס המזון  — 6 שבועות (42 יום)
//   בית ההחלמה   — 5 שבועות (35 יום)
//
// six_weeks_end במסד הוא תאריך הסיום של *הכרטיס* (וגם היעד של הארכה ידנית).
// חלון בית ההחלמה נגזר ממנו בהפחתת שבוע — כך שהארכה ידנית חלה על שניהם,
// ואי אפשר להאריך יולדת ולגלות שהיא עדיין חסומה בבית ההחלמה.
export const CARD_WINDOW_DAYS = 42
export const RECOVERY_WINDOW_DAYS = 35

type WindowAid = { birth_date?: string | null; six_weeks_end?: string | null }

/** סוף תוקף כרטיס המזון (6 שבועות מהלידה, או התאריך שהוארך ידנית). */
export function cardWindowEnd(aid: WindowAid): Date | null {
  if (aid.six_weeks_end) return new Date(aid.six_weeks_end)
  if (!aid.birth_date) return null
  return new Date(new Date(aid.birth_date).getTime() + CARD_WINDOW_DAYS * 86400000)
}

/** סוף תוקף הזכאות לבית החלמה (5 שבועות מהלידה; הארכה ידנית נגררת גם לכאן). */
export function recoveryWindowEnd(aid: WindowAid): Date | null {
  // 🔴 הארכה ידנית = התאריך שהוזן, בלי לגרוע ממנו.
  //
  // ⚠️ קודם נגרעו 7 ימים גם מהארכה ידנית, כדי לשמור על אותו פער שיש
  // בחישוב האוטומטי (42 לכרטיס מול 35 לבית החלמה). התוצאה: מזכירה
  // שהאריכה ליולדת עד 30.08 — היא נעלמה מפורטל בית ההחלמה כבר ב-23.08.
  //
  // 12 יולדות מאושרות היו מוסתרות מהפורטל, 4 מהן עם הארכה מפורשת
  // שנרשמה במסד ולא כובדה. בית ההחלמה לא ראה אותן, והן לא יכלו לממש
  // זכאות שכבר אושרה להן.
  //
  // ⚠️ הפער נשאר בחישוב ה*אוטומטי* בלבד — שם הוא כלל עסקי. תאריך
  // שהוזן ידנית הוא הכרעה מפורשת של המזכירה, ואין לגרוע ממנה.
  if (aid.six_weeks_end) return new Date(aid.six_weeks_end)
  if (!aid.birth_date) return null
  return new Date(new Date(aid.birth_date).getTime() + RECOVERY_WINDOW_DAYS * 86400000)
}

/** האם היולדת עדיין בתוך חלון הזכאות לבית החלמה. */
export function isWithinRecoveryWindow(aid: WindowAid): boolean {
  const end = recoveryWindowEnd(aid)
  if (!end) return false
  end.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return end >= today
}

export interface BabyEntry {
  name?: string | null
  gender?: 'male' | 'female' | null
  id_type?: 'id' | 'passport'
  id_number?: string | null
}
