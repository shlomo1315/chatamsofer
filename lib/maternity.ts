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
const WINDOW_GAP_DAYS = CARD_WINDOW_DAYS - RECOVERY_WINDOW_DAYS   // 7

type WindowAid = { birth_date?: string | null; six_weeks_end?: string | null }

/** סוף תוקף כרטיס המזון (6 שבועות מהלידה, או התאריך שהוארך ידנית). */
export function cardWindowEnd(aid: WindowAid): Date | null {
  if (aid.six_weeks_end) return new Date(aid.six_weeks_end)
  if (!aid.birth_date) return null
  return new Date(new Date(aid.birth_date).getTime() + CARD_WINDOW_DAYS * 86400000)
}

/** סוף תוקף הזכאות לבית החלמה (5 שבועות מהלידה; הארכה ידנית נגררת גם לכאן). */
export function recoveryWindowEnd(aid: WindowAid): Date | null {
  // הארכה ידנית: נגזר מהתאריך שהוזן, פחות אותו פער של שבוע.
  if (aid.six_weeks_end) {
    return new Date(new Date(aid.six_weeks_end).getTime() - WINDOW_GAP_DAYS * 86400000)
  }
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
