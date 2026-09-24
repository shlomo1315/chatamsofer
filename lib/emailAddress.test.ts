import { describe, it, expect } from 'vitest'
import { cleanEmail, emailError, isValidEmail } from './emailAddress'

describe('cleanEmail', () => {
  it('מוריד רווחים ומנרמל לאותיות קטנות', () => {
    expect(cleanEmail('  Shlomo@Gmail.COM ')).toBe('shlomo@gmail.com')
  })

  // 🔴 התקלה החוזרת: כתובת שהודבקה מ-Word נראית תקינה ונכשלת בשתיקה.
  it('מסיר תווי כיווניות בלתי נראים', () => {
    expect(cleanEmail('‏a@b.com‎')).toBe('a@b.com')
    expect(cleanEmail('‫a@b.com‬')).toBe('a@b.com')
    expect(cleanEmail('a@b.com﻿')).toBe('a@b.com')
  })

  it('מחזיר מחרוזת ריקה על null/undefined', () => {
    expect(cleanEmail(null)).toBe('')
    expect(cleanEmail(undefined)).toBe('')
  })
})

describe('emailError — כתובות תקינות', () => {
  const ok = [
    'a@b.co',
    'shlomo@gmail.com',
    'first.last@sub.domain.co.il',
    'user+tag@example.org',
    'a_b-c%d@example-host.com',
  ]
  for (const e of ok) {
    it(`מקבל ${e}`, () => {
      expect(emailError(e)).toBe('')
      expect(isValidEmail(e)).toBe(true)
    })
  }
})

describe('emailError — כתובות פסולות', () => {
  it('ריק', () => expect(emailError('')).toBe('נא להזין כתובת מייל'))
  it('רווחים בלבד', () => expect(emailError('   ')).toBe('נא להזין כתובת מייל'))
  it('בלי @', () => expect(emailError('shlomo.gmail.com')).toBe('חסר @ בכתובת'))
  it('שני @', () => expect(emailError('a@b@c.com')).toBe('יש יותר מ-@ אחד בכתובת'))
  it('בלי שם לפני ה-@', () => expect(emailError('@gmail.com')).toBe('חסר השם לפני ה-@'))
  it('בלי דומיין', () => expect(emailError('shlomo@')).toBe('חסר שם הדומיין אחרי ה-@'))

  // ⚠️ השגיאה הנפוצה ביותר בפועל.
  it('בלי סיומת', () => {
    expect(emailError('shlomo@gmail')).toBe('חסרה סיומת בדומיין (לדוגמה ‎.com)')
  })

  it('נקודות רצופות', () => expect(emailError('a..b@c.com')).toBe('יש שתי נקודות רצופות בכתובת'))
  it('נקודה בקצה החלק המקומי', () => {
    expect(emailError('.a@b.com')).toContain('נקודה')
    expect(emailError('a.@b.com')).toContain('נקודה')
  })

  it('רווח בתוך הכתובת', () => expect(emailError('a b@c.com')).toBe('כתובת המייל אינה תקינה'))

  // ⚠️ אין TLD עם ספרה — זו הקלדה שגויה, לא כתובת אמיתית.
  it('סיומת עם ספרה', () => expect(emailError('a@b.c1')).toBe('כתובת המייל אינה תקינה'))
  it('סיומת בת אות אחת', () => expect(emailError('a@b.c')).toBe('כתובת המייל אינה תקינה'))
  it('דומיין שמתחיל במקף', () => expect(emailError('a@-b.com')).toBe('כתובת המייל אינה תקינה'))
  it('עברית בכתובת', () => expect(emailError('שלמה@gmail.com')).toBe('כתובת המייל אינה תקינה'))

  it('ארוך מדי', () => {
    expect(emailError(`${'a'.repeat(250)}@b.com`)).toBe('הכתובת ארוכה מדי')
  })

  it('כל הפסולות מחזירות false ב-isValidEmail', () => {
    for (const e of ['', 'a', 'a@b', 'a@b.c', 'a b@c.com']) {
      expect(isValidEmail(e)).toBe(false)
    }
  })
})
