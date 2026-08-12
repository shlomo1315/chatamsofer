// ─────────────────────────────────────────────────────────────────────────────
// מימוש בית ההחלמה — האם היולדת מימשה את הזכאות, והאם כבר חויבה.
//
// 🔴 השאלה שהמודול הזה עונה עליה: "כמה יולדות כבר מימשו בית החלמה, וכמה עוד
// לא". הסטטוס הכללי של הבקשה (status) אינו עונה עליה — בקשה יכולה להיות
// 'active' גם כשהיולדת טרם הגיעה, וגם אחרי שיצאה.
//
// ⚠️ שני צירים *נפרדים*, ובכוונה:
//   מימוש — האם הגיעה בפועל לבית ההחלמה (recovery_arrived).
//   חיוב  — האם בית ההחלמה הגיש קבלה (recovery_receipts).
//
// מיזוגם לציר אחד היה מסתיר בדיוק את הפער שהמשרד צריך לראות: יולדת שכבר
// עזבה ובית ההחלמה טרם גבה. זה כסף שטרם שולם, ואי אפשר לאתר אותו בלי
// ההבחנה הזו.
// ─────────────────────────────────────────────────────────────────────────────

export type RecoveryState =
  /** הגיעה בפועל, ובית ההחלמה כבר הגיש קבלה. */
  | 'realized-charged'
  /** הגיעה בפועל, אך טרם הוגשה קבלה — כסף שטרם נגבה. */
  | 'realized-unbilled'
  /** אושרה לבית החלמה אך טרם הגיעה. */
  | 'not-realized'
  /** לא ביקשה בית החלמה כלל — אינה חלק מהספירה. */
  | 'none'

export const RECOVERY_LABEL: Record<RecoveryState, string> = {
  'realized-charged': 'מימשה וחויבה',
  'realized-unbilled': 'מימשה — טרם חויבה',
  'not-realized': 'טרם מימשה',
  'none': 'ללא בית החלמה',
}

export interface RecoverySource {
  recovery_home?: string | null
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string | null
  /** מספר הקבלות שהוגשו לבקשה הזו. */
  receiptCount?: number | null
  /** הסכום המצטבר מכל הקבלות. */
  recovery_amount?: number | null
  /** לילות השהייה — לסיכום בפילוח. */
  recovery_nights?: number | null
}

/**
 * מצב המימוש של בקשה אחת.
 *
 * ⚠️ "הגיעה" נקבע לפי recovery_arrived ולא לפי קיום תאריך: הדגל הוא מה
 * שהמזכירות מסמנת, והתאריך עשוי להיות ריק גם בסימון תקין.
 *
 * ⚠️ קבלה נחשבת חיוב גם כשהסכום 0 — הקבלה היא האירוע, לא הסכום. סכום 0
 * הוא תקלה שצריך לראות בדוח, לא סיבה לסווג את היולדת כ"טרם חויבה".
 */
export function recoveryState(src: RecoverySource): RecoveryState {
  const home = String(src.recovery_home ?? '').trim()
  if (!home) return 'none'

  const arrived = src.recovery_arrived === true
  if (!arrived) return 'not-realized'

  const receipts = Number(src.receiptCount ?? 0)
  return receipts > 0 ? 'realized-charged' : 'realized-unbilled'
}

export interface RecoveryTotals {
  realizedCharged: number
  realizedUnbilled: number
  notRealized: number
  /** סך המימושים — שני המצבים שבהם היולדת הגיעה בפועל. */
  realized: number
  /** סכום מצטבר שחויב. */
  amount: number
  /** לילות מצטברים. */
  nights: number
}

/**
 * פילוח לפי בית החלמה.
 *
 * ⚠️ בית החלמה שאין בו אף מימוש עדיין מופיע ברשימה עם 0: היעלמותו הייתה
 * נראית כאילו לא הופנו אליו יולדות, בעוד שבפועל הופנו והן טרם הגיעו.
 */
export function groupByHome(
  rows: RecoverySource[],
): Map<string, RecoveryTotals> {
  const m = new Map<string, RecoveryTotals>()
  const blank = (): RecoveryTotals => ({
    realizedCharged: 0, realizedUnbilled: 0, notRealized: 0, realized: 0, amount: 0, nights: 0,
  })

  for (const r of rows) {
    const state = recoveryState(r)
    if (state === 'none') continue
    const home = String(r.recovery_home ?? '').trim() || '—'
    if (!m.has(home)) m.set(home, blank())
    const t = m.get(home)!

    if (state === 'realized-charged') { t.realizedCharged++; t.realized++ }
    else if (state === 'realized-unbilled') { t.realizedUnbilled++; t.realized++ }
    else t.notRealized++

    t.amount += Number(r.recovery_amount ?? 0) || 0
    t.nights += Number(r.recovery_nights ?? 0) || 0
  }
  return m
}

/** סיכום כולל על פני כל בתי ההחלמה. */
export function totalsOf(rows: RecoverySource[]): RecoveryTotals {
  const all: RecoveryTotals = {
    realizedCharged: 0, realizedUnbilled: 0, notRealized: 0, realized: 0, amount: 0, nights: 0,
  }
  for (const t of groupByHome(rows).values()) {
    all.realizedCharged += t.realizedCharged
    all.realizedUnbilled += t.realizedUnbilled
    all.notRealized += t.notRealized
    all.realized += t.realized
    all.amount += t.amount
    all.nights += t.nights
  }
  return all
}
