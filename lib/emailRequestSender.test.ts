import { describe, it, expect } from 'vitest'

// ⚠️ אבטחה: קליטת בקשות במייל מזהה את המוטב לפי ת"ז בשורת הנושא בלבד.
// כתובת השולח ניתנת לזיוף ות"ז אינה סוד — ולכן בלי התאמה בין השולח
// לכתובת הרשומה, כל אחד היה יכול:
//   (א) לקבל בחזרה שם משפחה, מצב משפחתי וסיבת דחייה פנימית של אדם אחר;
//   (ב) לפתוח בקשות ולצרף מסמכים על שמו של אדם אחר.
// הבדיקות מקבעות את הכלל שמונע זאת.

/** אותה השוואה שמבוצעת ב-lib/emailRequestIntake.ts */
const senderMatches = (from: string, benEmail: string | null | undefined) => {
  const a = (benEmail || '').trim().toLowerCase()
  const b = (from || '').trim().toLowerCase()
  return !!a && a === b
}

describe('קליטת בקשה במייל — אימות השולח', () => {
  it('שולח זר עם ת"ז של אדם אחר נדחה', () => {
    expect(senderMatches('attacker@evil.com', 'victim@gmail.com')).toBe(false)
  })

  it('הכתובת הרשומה מתקבלת', () => {
    expect(senderMatches('victim@gmail.com', 'victim@gmail.com')).toBe(true)
  })

  it('ההשוואה אינה תלוית רישיות ורווחים', () => {
    expect(senderMatches('Victim@Gmail.com', '  victim@gmail.com ')).toBe(true)
  })

  it('מוטב ללא כתובת מייל רשומה — נדחה, לא מתקבל בטעות', () => {
    // ⚠️ מחרוזת ריקה לא תיחשב "התאמה" מול from ריק
    expect(senderMatches('attacker@evil.com', null)).toBe(false)
    expect(senderMatches('', '')).toBe(false)
  })
})
