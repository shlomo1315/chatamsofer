// זיהוי כתובות מייל פגומות.
//
// למה זה חשוב מספיק לבדיקות: כתובת פגומה לא תאומת לעולם, וגם לא תקבל את
// הבקשה לאמת. אם היא לא מסומנת — היא נשארת לנצח ב"טרם אומתו", כל "שלח לכולם"
// מנסה לשלוח אליה שוב, והמנהל לא מבין למה המספר לא זז.
// ולכן גם הכיוון ההפוך קריטי: כתובת תקינה שסומנה בטעות כפגומה לא תקבל בקשה
// כלל, ותישאר לא מאומתת באשמתנו.
import { describe, it, expect } from 'vitest'
import { isValidEmail, emailProblem, EMAIL_RE } from './emailVerification'

describe('emailProblem — למה הכתובת פגומה', () => {
  it('כתובות תקינות אינן מסומנות', () => {
    const good = [
      'a@b.co',
      'israel.cohen@gmail.com',
      'test+tag@example.co.il',
      'UPPER@GMAIL.COM',
      '4363773@gmail.com',
      'a_b-c.d@sub.domain.org',
    ]
    for (const e of good) {
      expect(emailProblem(e), `סומנה בטעות: ${e}`).toBeNull()
      expect(isValidEmail(e), `נדחתה בטעות: ${e}`).toBe(true)
    }
  })

  it('מסביר בדיוק מה הבעיה בכל סוג של כתובת פגומה', () => {
    expect(emailProblem('')).toBe('אין כתובת')
    expect(emailProblem(null)).toBe('אין כתובת')
    expect(emailProblem(undefined)).toBe('אין כתובת')
    expect(emailProblem(' a@b.co ')).toBe('רווחים מיותרים')
    expect(emailProblem('plainaddress')).toBe('חסר @')
    expect(emailProblem('a@@b.co')).toBe('יותר מ-@ אחד')
    expect(emailProblem('a@b@c.co')).toBe('יותר מ-@ אחד')
    expect(emailProblem('@b.co')).toBe('חסר שם לפני ה-@')
    expect(emailProblem('a@')).toBe('חסר דומיין')
    expect(emailProblem('a@bco')).toBe('דומיין בלי נקודה')
    expect(emailProblem('a b@c.co')).toBe('רווח בתוך הכתובת')
    expect(emailProblem('ישראל@gmail.com')).toBe('אותיות עבריות')
    expect(emailProblem('a@b.co.')).toBe('דומיין מסתיים בנקודה')
  })

  it('⚠️ כל כתובת שאינה ניתנת למשלוח נדחית ע"י isValidEmail *וגם* מסומנת', () => {
    // הפער בין השתיים הוא הבאג המסוכן: אם המסך מסמן "פגום" אבל השולח חושב
    // שתקין — נשלחת הודעה שנכשלת ומסמנת "נשלחה בקשה" למי שלא קיבל דבר.
    const undeliverable = ['', 'plainaddress', 'a@@b.co', '@b.co', 'a@', 'a@bco', 'a b@c.co', 'ישראל@gmail.com', 'a@b.co.']
    for (const e of undeliverable) {
      expect(emailProblem(e), `לא סומנה: ${e}`).not.toBeNull()
      expect(isValidEmail(e), `עברה סינון בטעות: ${e}`).toBe(false)
    }
  })

  it('אותיות עבריות נדחות — הרגקס לבדו מקבל אותן', () => {
    // /^[^\s@]+@[^\s@]+\.[^\s@]+$/ מקבל "ישראל@gmail.com" (אות עברית אינה
    // רווח ואינה @), הספק דוחה, וכל "שלח לכולם" היה מנסה אותה שוב ונכשל.
    expect(EMAIL_RE.test('ישראל@gmail.com')).toBe(true)
    expect(isValidEmail('ישראל@gmail.com')).toBe(false)
  })

  it('רווחים בקצוות מסומנים אך אינם פוסלים את הכתובת עצמה', () => {
    // הכתובת עצמה תקינה — הבעיה היא בשמירה. סימון מאפשר למנהל לתקן בקלות.
    expect(emailProblem(' israel@gmail.com')).toBe('רווחים מיותרים')
    expect(isValidEmail(' israel@gmail.com')).toBe(true)
  })
})
