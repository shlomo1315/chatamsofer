import { describe, it, expect } from 'vitest'
import { unloadDueDate } from './unloadDueDate'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג שהבדיקות האלה נועלות:
//
// הפריקה האוטומטית סיננה `.lte('six_weeks_end', today)` במסד, אבל 194
// מתוך 208 הכרטיסים הטעונים היו עם six_weeks_end = NULL. השוואה ל-NULL
// אינה מחזירה שורות לעולם — ולכן הפריקה רצה כל לילה, מצאה 0 תיקים,
// דיווחה הצלחה, וכלום לא נפרק.
//
// 12 יולדות עברו שישה שבועות עם ₪7,200 תקועים בכרטיסים, והמסך הציג
// "הגיע זמן פריקה" בזמן שהשאילתה לא ראתה אותן בכלל.
// ─────────────────────────────────────────────────────────────────────────────

describe('unloadDueDate — מתי הכרטיס אמור להיפרק', () => {
  it('six_weeks_end קיים — משתמשים בו', () => {
    expect(unloadDueDate({ six_weeks_end: '2026-09-01', birth_date: '2026-07-01' }))
      .toBe('2026-09-01')
  })

  it('🔴 six_weeks_end ריק — נגזר מהלידה + 42 יום', () => {
    // זה המקרה של 194 התיקים. בלי הנפילה-לאחור הם לא נפרקים לעולם.
    expect(unloadDueDate({ six_weeks_end: null, birth_date: '2026-07-10' }))
      .toBe('2026-08-21')
  })

  it('six_weeks_end כמחרוזת ריקה נחשב חסר', () => {
    expect(unloadDueDate({ six_weeks_end: '   ', birth_date: '2026-07-10' }))
      .toBe('2026-08-21')
  })

  it('⚠️ אין תאריך לידה ואין six_weeks_end — null, לא ניחוש', () => {
    // פריקה על סמך ניחוש הייתה לוקחת כסף מיולדת שאולי בתוך התקופה.
    expect(unloadDueDate({ six_weeks_end: null, birth_date: null })).toBeNull()
  })

  it('🔴 תאריך לידה פגום מחזיר null ואינו זורק', () => {
    // Invalid Date אינו זורק אלא מחזיר NaN, וללא בדיקה מפורשת התוצאה
    // הייתה "Invalid Date" כמחרוזת — והשוואה אליה מתנהגת באופן בלתי צפוי.
    expect(unloadDueDate({ six_weeks_end: null, birth_date: 'לא-תאריך' })).toBeNull()
    expect(unloadDueDate({ six_weeks_end: null, birth_date: '' })).toBeNull()
  })

  it('חוצה גבול חודש נכון', () => {
    // 42 יום מ-31.07 = 11.09
    expect(unloadDueDate({ six_weeks_end: null, birth_date: '2026-07-31' }))
      .toBe('2026-09-11')
  })

  it('חוצה גבול שנה נכון', () => {
    expect(unloadDueDate({ six_weeks_end: null, birth_date: '2026-12-01' }))
      .toBe('2027-01-12')
  })

  it('timestamp מלא נחתך לתאריך בלבד', () => {
    // six_weeks_end מגיע לעתים עם שעה; ההשוואה היא על yyyy-mm-dd.
    expect(unloadDueDate({ six_weeks_end: '2026-09-01T00:00:00Z', birth_date: null }))
      .toBe('2026-09-01')
  })
})
