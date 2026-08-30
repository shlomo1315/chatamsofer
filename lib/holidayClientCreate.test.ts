import { describe, it, expect } from 'vitest'
import { pickZeoutForCreate, isAlreadyRegistered } from './holidayClientCreate'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הקמת משפחה בנדרים לפני טעינת כרטיס החגים.
//
// עד כה loadOne רק *חיפשה* (findClientByZeout), ומשפחה שאינה קיימת בנדרים
// החזירה "לא נמצא לקוח" — הכרטיס לא נטען כלל. ההקמה סוגרת את הפער.
//
// ⚠️ הכללים כאן אינם המצאה: הם אותם כללים שכבר נלמדו בדם ביולדות
// (lib/maternityCards) — ראו ההערות שם. משפחה בנדרים עשויה להיות רשומה
// על שם בן/בת הזוג, ודרכון יושב בשדה אחר מת"ז.
// ─────────────────────────────────────────────────────────────────────────────

describe('pickZeoutForCreate — איזו ת"ז נשלחת להקמה', () => {
  it('ת"ז של הבעל כשיש רק אותה', () => {
    expect(pickZeoutForCreate('325031656', null)).toBe('325031656')
  })

  it('⚠️ ת"ז האשה כשת"ז הבעל ריקה — אחרת ההקמה נכשלת לגמרי', () => {
    expect(pickZeoutForCreate(null, '022963573')).toBe('022963573')
  })

  it('🔴 מעדיף ת"ז ישראלית על דרכון — נדרים מחפש בעיקר לפי Zeout', () => {
    // הבעל עם דרכון, האשה עם ת"ז → נשלחת של האשה.
    expect(pickZeoutForCreate('A1234567', '022963573')).toBe('022963573')
  })

  it('שתיהן דרכונים — נשלח מה שיש, ינותב למזהה ג׳', () => {
    expect(pickZeoutForCreate('A1234567', 'B7654321')).toBe('A1234567')
  })

  it('אין כלום → null, וההקמה לא תנוסה', () => {
    expect(pickZeoutForCreate(null, null)).toBeNull()
    expect(pickZeoutForCreate('', '   ')).toBeNull()
  })
})

describe('isAlreadyRegistered — 🔴 "כבר רשום" אינה שגיאה', () => {
  // ⚠️ נדרים דוחה הקמה כפולה בהודעה הזו, וזה בדיוק המצב הרצוי: קיים שם
  // לקוח עם אותה ת"ז. ביולדות זה עצר את ההטענה עד שזוהה.
  it('מזהה את ההודעה מנדרים', () => {
    expect(isAlreadyRegistered('מספר זהות זה כבר רשום אצל ישראלי יעקב')).toBe(true)
  })

  it('מזהה גם ניסוח באנגלית', () => {
    expect(isAlreadyRegistered('id already exists')).toBe(true)
    expect(isAlreadyRegistered('already registered')).toBe(true)
  })

  it('שגיאה אמיתית אינה מזוהה ככזו', () => {
    expect(isAlreadyRegistered('מספר זהות שגוי. נא לרשום מספר בספרות בלבד')).toBe(false)
    expect(isAlreadyRegistered('')).toBe(false)
  })
})
