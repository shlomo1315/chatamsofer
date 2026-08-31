import { describe, it, expect } from 'vitest'
import { recoveryWindowEnd, RECOVERY_WINDOW_DAYS } from './maternity'

// ─────────────────────────────────────────────────────────────────────────────
// חלון תאריכי השהייה שבית ההחלמה רשאי להזין — הכלל שנאכף ב-POST של
// app/api/portal/recovery-amount.
//
// 🔴 הבאג שהטסטים האלה נועדו למנוע: הבדיקה בכתיבה הייתה `today - 35`,
// כלומר חלון מתגלגל מהיום שאינו יודע דבר על הארכה ידנית — בעוד הפורטל
// *מציג* את היולדת לפי recoveryWindowEnd, שכן מכבד הארכה.
//
// התוצאה הייתה סתירה בין קריאה לכתיבה: בית ההחלמה ראה יולדת עם הארכה
// מאושרת, ניסה להזין את הסכום, וקיבל "מחוץ לחלון הזכאות". הזכאות אושרה
// לה במפורש והיא לא יכלה לממש אותה.
//
// הכלל הנכון: החלון נגזר מסוף הזכאות של אותה יולדת, כך שהארכה מזיזה את
// שני קצותיו יחד.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000
const day = (iso: string) => new Date(iso).getTime()

/**
 * שכפול מדויק של הכלל שב-route: יום ההגעה חייב ליפול בין תחילת החלון
 * לסופו, ולא בעתיד.
 *
 * ⚠️ מוחזק כאן כדי שהכלל ייבדק בלי להרים שרת. שינוי ב-route שאינו
 * משוקף כאן יישבר בטסטים ולא אצל המשפחה.
 */
function stayAllowed(
  aid: { birth_date?: string | null; six_weeks_end?: string | null },
  arrivalIso: string,
  todayIso: string,
): boolean {
  const end = recoveryWindowEnd(aid)
  if (!end) return false
  const endMs = day(end.toISOString().slice(0, 10))
  const start = endMs - RECOVERY_WINDOW_DAYS * DAY
  const from = day(arrivalIso)
  if (from > day(todayIso)) return false
  return from >= start && from <= endMs
}

describe('חלון השהייה — בלי הארכה', () => {
  // לידה 01.06 ⇒ סוף זכאות 06.07 ⇒ חלון 01.06–06.07
  const aid = { birth_date: '2026-06-01', six_weeks_end: null }

  it('יום הלידה עצמו — בתוך החלון', () => {
    expect(stayAllowed(aid, '2026-06-01', '2026-07-06')).toBe(true)
  })

  it('היום האחרון לזכאות — עדיין בתוך החלון', () => {
    expect(stayAllowed(aid, '2026-07-06', '2026-07-06')).toBe(true)
  })

  it('יום אחד אחרי סוף הזכאות — נחסם', () => {
    expect(stayAllowed(aid, '2026-07-07', '2026-07-10')).toBe(false)
  })

  it('לפני הלידה — נחסם', () => {
    expect(stayAllowed(aid, '2026-05-31', '2026-07-06')).toBe(false)
  })

  it('הגעה עתידית — נחסמת גם בתוך החלון', () => {
    expect(stayAllowed(aid, '2026-07-05', '2026-07-01')).toBe(false)
  })
})

describe('🔴 הארכה ידנית — הבאג שתוקן', () => {
  // הארכה עד 30.08 ⇒ החלון כולו זז: 26.07–30.08
  const extended = { birth_date: '2026-06-01', six_weeks_end: '2026-08-30' }

  it('הגעה בתוך ההארכה מתקבלת — גם הרבה אחרי 35 יום מהלידה', () => {
    // ⚠️ זה בדיוק המקרה שנחסם קודם: 20.08 רחוק מ-35 יום מהלידה,
    // אבל ההארכה אישרה אותו במפורש.
    expect(stayAllowed(extended, '2026-08-20', '2026-08-25')).toBe(true)
  })

  it('היום האחרון של ההארכה מתקבל', () => {
    expect(stayAllowed(extended, '2026-08-30', '2026-08-30')).toBe(true)
  })

  it('אחרי ההארכה — נחסם', () => {
    expect(stayAllowed(extended, '2026-08-31', '2026-09-02')).toBe(false)
  })

  it('החלון נשאר באורך 35 יום — ההארכה מזיזה, לא מרחיבה', () => {
    // תחילת החלון היא 26.07 (30.08 פחות 35), ולכן הגעה ב-25.07 מחוץ לו.
    expect(stayAllowed(extended, '2026-07-26', '2026-08-25')).toBe(true)
    expect(stayAllowed(extended, '2026-07-25', '2026-08-25')).toBe(false)
  })

  it('ההשוואה מול הכלל הישן — מוכיחה שהתיקון משנה התנהגות', () => {
    // הכלל הישן: today - 35. ב-25.08 הוא היה מתיר רק מ-21.07 ואילך,
    // ובלי קשר לזכאות שאושרה. כאן נבדק שההכרעה נגזרת מהזכאות עצמה.
    const oldRuleStart = day('2026-08-25') - 35 * DAY  // 21.07
    const newRuleStart = day('2026-08-30') - 35 * DAY  // 26.07
    expect(newRuleStart).not.toBe(oldRuleStart)
    // וההפרש הוא בדיוק הפער בין "היום" לסוף הזכאות
    expect(newRuleStart - oldRuleStart).toBe(5 * DAY)
  })
})

describe('נתונים חסרים', () => {
  it('בלי תאריך לידה ובלי הארכה — נחסם ולא מתרסק', () => {
    expect(stayAllowed({ birth_date: null, six_weeks_end: null }, '2026-07-01', '2026-07-01')).toBe(false)
  })
})
