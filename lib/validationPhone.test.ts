import { describe, it, expect } from 'vitest'
import { validatePhone, validateLandline, validatePhoneOrLandline } from './validation'

describe('validateLandline — קו נייח ישראלי', () => {
  it('מקבל קידומות אזוריות תקינות ב-9 ספרות', () => {
    expect(validateLandline('025381234')).toBe(true)  // ירושלים
    expect(validateLandline('035551234')).toBe(true)  // תל אביב
    expect(validateLandline('048123456')).toBe(true)  // חיפה
    expect(validateLandline('086543210')).toBe(true)  // דרום
    expect(validateLandline('097654321')).toBe(true)  // שרון
    expect(validateLandline('077123456')).toBe(true)  // VoIP
  })

  it('מתעלם ממקפים ורווחים שהמשתמש מקליד', () => {
    expect(validateLandline('02-538-1234')).toBe(true)
    expect(validateLandline(' 02 538 1234 ')).toBe(true)
  })

  // 🔴 הגבול המרכזי: נייד אינו נייח. אילו 05 היה עובר, מספר נייד שהוקלד
  // בחסר ספרה היה נשמר כ"נייח תקין" — והצינתוקים אליו היו נכשלים בשקט.
  it('דוחה נייד, גם כשהוא באורך של נייח', () => {
    expect(validateLandline('050412874')).toBe(false)   // נייד חסר ספרה
    expect(validateLandline('0504128742')).toBe(false)  // נייד מלא
  })

  it('דוחה אורך שגוי', () => {
    expect(validateLandline('0253812')).toBe(false)     // קצר
    expect(validateLandline('0253812345')).toBe(false)  // ארוך
    expect(validateLandline('')).toBe(false)
  })

  it('דוחה קידומת שאינה קיימת', () => {
    expect(validateLandline('012345678')).toBe(false)
    expect(validateLandline('065432109')).toBe(false)
    expect(validateLandline('123456789')).toBe(false)   // בלי 0 מוביל
  })
})

describe('validatePhone — נייד בלבד, ללא שינוי', () => {
  it('ממשיך לקבל נייד ולדחות נייח', () => {
    expect(validatePhone('0504128742')).toBe(true)
    expect(validatePhone('025381234')).toBe(false)
  })
})

describe('validatePhoneOrLandline — שדה "טלפון נוסף"', () => {
  it('מקבל את שניהם', () => {
    expect(validatePhoneOrLandline('0504128742')).toBe(true)
    expect(validatePhoneOrLandline('025381234')).toBe(true)
  })

  it('דוחה מה ששניהם דוחים', () => {
    expect(validatePhoneOrLandline('050412874')).toBe(false)
    expect(validatePhoneOrLandline('12345')).toBe(false)
    expect(validatePhoneOrLandline('')).toBe(false)
  })
})
