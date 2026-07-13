import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  cardWindowEnd, recoveryWindowEnd, isWithinRecoveryWindow,
  CARD_WINDOW_DAYS, RECOVERY_WINDOW_DAYS,
} from './maternity'

// ─────────────────────────────────────────────────────────────────────────────
// שני חלונות מימוש שונים:
//   כרטיס מזון  — 6 שבועות (42 יום)
//   בית החלמה   — 5 שבועות (35 יום)
//
// six_weeks_end במסד הוא תאריך הכרטיס. שינוי בו חייב להשפיע על שניהם, אבל
// שגיאה כאן = כרטיסים שנפרקים שבוע מוקדם מדי, או יולדות שנחסמות בטעות.
// ─────────────────────────────────────────────────────────────────────────────

const iso = (d: Date | null) => d ? d.toISOString().slice(0, 10) : null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-13T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('הקבועים', () => {
  it('בית ההחלמה נסגר שבוע לפני הכרטיס', () => {
    expect(CARD_WINDOW_DAYS).toBe(42)
    expect(RECOVERY_WINDOW_DAYS).toBe(35)
    expect(CARD_WINDOW_DAYS - RECOVERY_WINDOW_DAYS).toBe(7)
  })
})

describe('בלי הארכה ידנית — נגזר מתאריך הלידה', () => {
  const aid = { birth_date: '2026-06-01', six_weeks_end: null }

  it('כרטיס: לידה + 42 יום', () => {
    expect(iso(cardWindowEnd(aid))).toBe('2026-07-13')
  })

  it('בית החלמה: לידה + 35 יום', () => {
    expect(iso(recoveryWindowEnd(aid))).toBe('2026-07-06')
  })
})

describe('עם הארכה ידנית — נגררת לשניהם', () => {
  // המשרד האריך את הזכאות ל-01/08. הכרטיס תקף עד אז, ובית ההחלמה
  // עד שבוע לפני — כדי שההארכה תחול על שניהם ולא תיווצר יולדת שהוארכה
  // אך עדיין חסומה בבית ההחלמה.
  const aid = { birth_date: '2026-06-01', six_weeks_end: '2026-08-01' }

  it('כרטיס: התאריך שהוארך', () => {
    expect(iso(cardWindowEnd(aid))).toBe('2026-08-01')
  })

  it('בית החלמה: שבוע לפני התאריך שהוארך', () => {
    expect(iso(recoveryWindowEnd(aid))).toBe('2026-07-25')
  })

  it('ההארכה אכן פותחת מחדש בית החלמה שהיה נסגר', () => {
    const noExt = { birth_date: '2026-06-01', six_weeks_end: null }
    expect(isWithinRecoveryWindow(noExt)).toBe(false)   // 06/07 — כבר עבר
    expect(isWithinRecoveryWindow(aid)).toBe(true)      // 25/07 — עדיין פתוח
  })
})

describe('isWithinRecoveryWindow — גבולות', () => {
  it('יום 35 בדיוק — עדיין פעיל', () => {
    // 35 יום לפני 13/07 = 08/06
    expect(isWithinRecoveryWindow({ birth_date: '2026-06-08', six_weeks_end: null })).toBe(true)
  })

  it('יום 36 — כבר לא פעיל', () => {
    expect(isWithinRecoveryWindow({ birth_date: '2026-06-07', six_weeks_end: null })).toBe(false)
  })

  it('יום 40 — הכרטיס עדיין תקף, אך בית ההחלמה נסגר', () => {
    // זה בדיוק ההבדל בין שני החלונות.
    const aid = { birth_date: '2026-06-03', six_weeks_end: null }
    const card = cardWindowEnd(aid)!
    const today = new Date('2026-07-13')
    expect(card >= today).toBe(true)                  // כרטיס: פתוח
    expect(isWithinRecoveryWindow(aid)).toBe(false)   // בית החלמה: סגור
  })

  it('בלי תאריך לידה — לא פעיל (ולא קורס)', () => {
    expect(isWithinRecoveryWindow({ birth_date: null, six_weeks_end: null })).toBe(false)
    expect(cardWindowEnd({ birth_date: null, six_weeks_end: null })).toBeNull()
  })
})
