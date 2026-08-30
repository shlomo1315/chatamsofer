import { describe, it, expect } from 'vitest'
import { isValidEmail } from './emailVerification'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כתובות שבהן טלפון וכתובת נדחסו לשדה אחד.
//
// כל אלה כתובות אמיתיות מהמסד, שעברו את הולידציה שלנו והתקבלו — ורק
// מערכת הדיוור החיצונית דחתה אותן ביבוא. הרגקס הישן בדק "יש @ ויש נקודה"
// בלבד, ולכן "gmail.com30005000" נחשב דומיין תקין: com30005000 הוא אכן
// רצף שאינו רווח ואינו @.
//
// ⚠️ הגבול (ראו lib/emailDomainFix): דומיין שגוי עם שם תקין ניתן לתיקון,
// שם שגוי אי אפשר לנחש. כאן רק *מזהים* — התיקון נשאר אנושי.
// ─────────────────────────────────────────────────────────────────────────────

const REAL_BAD = [
  '0504197002@gmail.com0541234',   // גומבו — זבל אחרי ה-TLD
  '0527166134@gmail.com30005000',  // ווייס — טלפון הודבק אחרי .com
  '0533195278@30005000.,com',      // גרינברגר — פסיק בדומיין
  'v0533166411@,gnaij.cib',        // וולך — פסיק + TLD מומצא
  '0583297761,r@gmail.com',        // קראוס — טלפון+פסיק לפני השם
  '.@gmail.comb036506864',         // פרייזלר — אין שם משתמש כלל
  'a@w0548494514.c',               // נוימן — TLD בן תו אחד
  'a0527618765@g.k',               // ברגר — דומיין ו-TLD בני תו אחד
  'f616500@gweil.com000',          // פרידמן — זבל אחרי ה-TLD
]

describe('כתובות שטלפון נדחס לתוכן — חייבות להיפסל', () => {
  it.each(REAL_BAD)('נפסלת: %s', (bad) => {
    expect(isValidEmail(bad)).toBe(false)
  })
})

describe('כתובות תקינות ממשיכות לעבור', () => {
  const GOOD = [
    'israel@gmail.com',
    'a.b-c_d@sub.domain.co.il',
    '0527166134@gmail.com',        // ⚠️ טלפון כשם משתמש הוא לגיטימי לגמרי
    'user+tag@example.org',
    'x@y.io',
  ]
  it.each(GOOD)('עוברת: %s', (good) => {
    expect(isValidEmail(good)).toBe(true)
  })
})

describe('מקרי קצה שכבר נתפסו — לא נשברים', () => {
  it('עברית נדחית', () => expect(isValidEmail('ישראל@gmail.com')).toBe(false))
  it('נקודה כפולה נדחית', () => expect(isValidEmail('a..b@gmail.com')).toBe(false))
  it('נקודה בסוף נדחית', () => expect(isValidEmail('a@gmail.com.')).toBe(false))
  it('ריק נדחה', () => expect(isValidEmail('')).toBe(false))
  it('null נדחה', () => expect(isValidEmail(null)).toBe(false))
})
