import { describe, it, expect } from 'vitest'
import { pickZeoutForCreate, isAlreadyRegistered, isUnknownClient, reviveLookupOrder } from './holidayClientCreate'

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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הלולאה הסגורה של 10.09 — שלוש יולדות בלי כרטיס.
//
// ⚠️ מה שקרה בפועל, חמש ריצות רצופות (13:03, 13:32, 13:33, 13:46):
//   1. המערכת מנכה כרטיס מהמלאי
//   2. AddTlush נכשל — "שגיאה באיתור משפחה" (nedarim_id התיישן)
//   3. הקוד מנסה *להקים* משפחה חדשה
//   4. נדרים דוחה — "מספר זהות זה כבר רשום אצל גולדשטין מרדכי"
//      ← אותה משפחה בדיוק שניסינו להקים
//   5. הכרטיס מוחזר למלאי, וחוזר חלילה בריצה הבאה
//
// 🔴 השורש: הקמה לפני חיפוש. המשפחה קיימת בנדרים — רק המזהה שלנו ישן.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 isUnknownClient — המזהה השמור אינו מוכר', () => {
  it('הנוסח המדויק מהלוגים', () => {
    expect(isUnknownClient('שגיאה באיתור משפחה. פנה לתמיכה טכנית.')).toBe(true)
  })

  it('נוסחים נוספים', () => {
    expect(isUnknownClient('לא נמצא לקוח')).toBe(true)
    expect(isUnknownClient('client not found')).toBe(true)
  })

  it('⚠️ שגיאה אחרת אינה מזוהה — אחרת נקים משפחות בכל כשל', () => {
    expect(isUnknownClient('אין מספיק יתרה')).toBe(false)
    expect(isUnknownClient('')).toBe(false)
    expect(isUnknownClient(null)).toBe(false)
  })

  it('🔴 "כבר רשום" אינו "לא נמצא" — שני מצבים הפוכים', () => {
    expect(isUnknownClient('מספר זהות זה כבר רשום אצל גולדשטין מרדכי')).toBe(false)
    expect(isAlreadyRegistered('מספר זהות זה כבר רשום אצל גולדשטין מרדכי')).toBe(true)
  })
})

describe('🔴 reviveLookupOrder — לחפש לפני שמקימים', () => {
  it('🔴 שתי הת"ז נבדקות — המשפחה רשומה לעתים על בן/בת הזוג', () => {
    expect(reviveLookupOrder('326675287', '208096800')).toEqual(['326675287', '208096800'])
  })

  it('ת"ז הבעל ריקה — נבדקת של האשה', () => {
    expect(reviveLookupOrder(null, '208096800')).toEqual(['208096800'])
  })

  it('⚠️ אין ת"ז כלל — רשימה ריקה, ואז ההקמה היא המוצא היחיד', () => {
    expect(reviveLookupOrder(null, null)).toEqual([])
    expect(reviveLookupOrder('  ', '')).toEqual([])
  })
})
