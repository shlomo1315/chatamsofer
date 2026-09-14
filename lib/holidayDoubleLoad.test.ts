import { describe, it, expect } from 'vitest'
import { countHolidayLoads } from './holidayCardLoad'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 השער שמונע טעינה כפולה. סלושץ (300505997) קיבל ₪500 פעמיים ב-10.09.
//
// ⚠️ 0 בטעות = טעינה כפולה של כסף אמיתי. זה הכשל היקר, ולכן נבדקים כאן
// כל מבני התשובה שנדרים מחזירה בפועל.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 countHolidayLoads — זיהוי טעינה שכבר יצאה', () => {
  it('מזהה טעינה אחת קיימת', () => {
    expect(countHolidayLoads({ Tlushim: [{ Amount: '500', TlushId: '1' }] }, 500)).toBe(1)
  })

  it('🔴 מזהה טעינה כפולה — המקרה של סלושץ', () => {
    expect(countHolidayLoads({ Tlushim: [
      { Amount: '500', TlushId: '1' }, { Amount: '500', TlushId: '2' },
    ] }, 500)).toBe(2)
  })

  it('משפחה שלא נטענה → 0 (לא חוסמים אותה)', () => {
    expect(countHolidayLoads({ Tlushim: [] }, 500)).toBe(0)
  })

  // ⚠️ פריט יחיד מוחזר כאובייקט ולא כמערך באורך 1.
  it('אובייקט יחיד ולא מערך', () => {
    expect(countHolidayLoads({ Tlushim: { Amount: '500', TlushId: '9' } }, 500)).toBe(1)
  })

  // ⚠️ המפתח אינו קבוע בין תשובות.
  it('מפתח חלופי Loads', () => {
    expect(countHolidayLoads({ Loads: [{ Amount: '500' }] }, 500)).toBe(1)
  })

  it('מפתח לא מוכר — מזוהה לפי צורת הפריטים', () => {
    expect(countHolidayLoads({ SomeOtherKey: [{ Amount: '500', TlushId: '3' }] }, 500)).toBe(1)
  })

  // 🔴 סכומים אחרים שייכים לתוכניות אחרות ואסור שיחסמו חלוקת חגים.
  it('טעינת יולדות ₪600 אינה נספרת', () => {
    expect(countHolidayLoads({ Tlushim: [{ Amount: '600' }] }, 500)).toBe(0)
  })

  it('סופר רק את סכום החלוקה מתוך תערובת', () => {
    expect(countHolidayLoads({ Tlushim: [
      { Amount: '600' }, { Amount: '500' }, { Amount: '1000' }, { Amount: '500' },
    ] }, 500)).toBe(2)
  })

  it('סכום עם פסיקים ומטבע', () => {
    expect(countHolidayLoads({ Tlushim: [{ Amount: '₪500.00' }] }, 500)).toBe(1)
  })

  // ⚠️ קלט פגום אינו מפיל ואינו מדווח על טעינה שאינה קיימת.
  it('null / undefined / מחרוזת → 0', () => {
    expect(countHolidayLoads(null, 500)).toBe(0)
    expect(countHolidayLoads(undefined, 500)).toBe(0)
    expect(countHolidayLoads('שגיאה', 500)).toBe(0)
  })

  it('שדה Sum במקום Amount', () => {
    expect(countHolidayLoads({ Tlushim: [{ Sum: '500', TlushId: '4' }] }, 500)).toBe(1)
  })
})
