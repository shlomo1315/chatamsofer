// ─────────────────────────────────────────────────────────────────────────────
// מינימום שבעה דורות מרבינו החתם סופר.
//
// 🔴 הכלל (שלמה, 26.11): אין צאצא רשום בדור נמוך מ-7. מי שדיווח שהוא דור
// רביעי, חמישי או שישי טעה בסדר הדורות: נדחה מיד ('rejected') ומקבל קישור
// לתיקון. אחרי תיקון תקין (דור 7 ומעלה ו-5 הדורות הראשונים תואמים לקובץ)
// הוא חוזר ל"ממתין לאישור ראשוני". אין מסלול שבו פחות משבעה דורות נכנס.
//
// ⚠️ השרשרת שנשלחת מהטופס כוללת את הנרשם עצמו כדור האחרון, ולכן הדור שלו
// הוא הדור הגבוה בשרשרת.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_GENERATIONS = 7

const REASON_PREFIX = 'פחות משבעה דורות'

/** הדור של הנרשם לפי השרשרת (הדור הגבוה בה), או null כשאין שרשרת. */
export function registrantGeneration(chain: unknown): number | null {
  if (!Array.isArray(chain)) return null
  let max = 0
  for (const c of chain) {
    const g = Number((c as { generation?: unknown } | null)?.generation)
    if (Number.isFinite(g) && g > max) max = g
  }
  return max > 0 ? max : null
}

/** true = דווח דור נמוך מ-7. בלי שרשרת אין קביעה (null → false). */
export function tooFewGenerations(generation: number | null | undefined): boolean {
  return typeof generation === 'number' && generation > 0 && generation < MIN_GENERATIONS
}

/** הסיבה שנשמרת ב-deep_review_reason של כרטסת שנדחתה. */
export function tooFewReason(generation: number): string {
  return `${REASON_PREFIX} (דווח דור ${generation}, המינימום הוא דור ${MIN_GENERATIONS})`
}

export function isTooFewReason(reason: string | null | undefined): boolean {
  return String(reason ?? '').trim().startsWith(REASON_PREFIX)
}

export interface GenerationsStatus {
  eligibility_status: 'rejected' | 'pending' | 'deep_review'
  deep_review_reason: string | null
}

/**
 * הסטטוס שכלל שבעת הדורות מחייב אחרי שינוי בשושלת, או null = הכלל לא מכריע
 * (הקורא ממשיך במסלול הרגיל שלו).
 *
 * - 'approved' לא נוגעים: החלטה של המשרד.
 * - פחות משבעה דורות → 'rejected' (גם מ'pending' / 'deep_review'). נדחה מסיבה
 *   אחרת נשאר עם הסיבה שלו.
 * - נדחה בגלל הכלל הזה ועכשיו תקין → חוזר: 'pending' כשהשער של 5 הדורות עובר,
 *   אחרת 'deep_review' עם סיבת השער.
 */
export async function generationsStatus(
  cur: { status: string | null | undefined; reason: string | null | undefined },
  generation: number | null,
  gate: () => Promise<{ deep: boolean; reason?: string | null }>,
): Promise<GenerationsStatus | null> {
  const status = cur.status ?? ''
  if (status === 'approved') return null
  const rejectedByRule = status === 'rejected' && isTooFewReason(cur.reason)
  if (tooFewGenerations(generation)) {
    if (status === 'rejected' && !rejectedByRule) return null
    return { eligibility_status: 'rejected', deep_review_reason: tooFewReason(generation as number) }
  }
  if (!rejectedByRule || generation == null) return null
  const g = await gate()
  return g.deep
    ? { eligibility_status: 'deep_review', deep_review_reason: g.reason ?? null }
    : { eligibility_status: 'pending', deep_review_reason: null }
}

/** ההודעה למשפחה כשהתיקון עדיין מכיל פחות משבעה דורות. */
export function tooFewMessage(generation: number): string {
  return `שימו לב, יש טעות בסדר הדורות שלכם: לפי מה שמילאתם אתם דור ${generation}, `
    + `ואין צאצאים רשומים בדור נמוך מ-${MIN_GENERATIONS}. יש להשלים את כל הדורות עד אליכם.`
}
