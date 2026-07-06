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

export interface BabyEntry {
  name?: string | null
  gender?: 'male' | 'female' | null
  id_type?: 'id' | 'passport'
  id_number?: string | null
}
