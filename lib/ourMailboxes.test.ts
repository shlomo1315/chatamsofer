import { describe, it, expect } from 'vitest'
import { isOurMailbox } from './ourMailboxes'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מייל שיצא מתיבה שלנו אינו בקשה.
//
// מה שקרה בפרודקשן: התיבה a3313187654@gmail.com ("עזר ליולדות מייל גוגל")
// מחוברת למערכת ומשמשת את המזכירות למתן שירות לנרשמים. כשמזכירה עונה
// משם למשפחה, המייל נקלט אצלנו כפנייה חדשה — אין ת"ז בנושא, ולכן נשלחת
// אליה "הבקשה לא נקלטה". המזכירה מוצפת, והמשפחה אינה מקבלת דבר.
//
// ⚠️ ההגנה הקיימת כיסתה רק @chasamsofer.info. שלוש מהתיבות שלנו יושבות
// ב-Gmail, והן נפלו בדיוק בפער הזה.
// ─────────────────────────────────────────────────────────────────────────────

const OURS = ['a3313187654@gmail.com', 'office@chasamsofer.info']

describe('isOurMailbox — 🔴 תיבות שלנו', () => {
  it('תיבת Gmail מחוברת', () => {
    expect(isOurMailbox('a3313187654@gmail.com', OURS)).toBe(true)
  })

  it('⚠️ אותיות גדולות — Gmail אינו רגיש לרישיות', () => {
    expect(isOurMailbox('A3313187654@Gmail.COM', OURS)).toBe(true)
  })

  it('⚠️ רווחים בקצוות', () => {
    expect(isOurMailbox('  a3313187654@gmail.com  ', OURS)).toBe(true)
  })

  it('כל כתובת בדומיין שלנו — גם בלי רשימה', () => {
    expect(isOurMailbox('anything@chasamsofer.info', [])).toBe(true)
    expect(isOurMailbox('code@chasamsofer.info', [])).toBe(true)
  })
})

describe('isOurMailbox — ⚠️ משפחות אינן נחסמות', () => {
  it('🔴 כתובת של משפחה מקבלת מענה כרגיל', () => {
    // זה הצד המסוכן: חסימה רחבה מדי הייתה משתיקה בקשות אמיתיות
    // בלי שאיש יידע שהן הגיעו.
    expect(isOurMailbox('family@gmail.com', OURS)).toBe(false)
  })

  it('כתובת דומה אך אינה שלנו', () => {
    expect(isOurMailbox('a3313187655@gmail.com', OURS)).toBe(false)
  })

  it('דומיין שנראה דומה אינו נחשב שלנו', () => {
    expect(isOurMailbox('someone@chasamsofer.info.evil.com', OURS)).toBe(false)
  })

  it('ריק אינו שלנו', () => {
    expect(isOurMailbox('', OURS)).toBe(false)
    expect(isOurMailbox(null, OURS)).toBe(false)
  })
})
