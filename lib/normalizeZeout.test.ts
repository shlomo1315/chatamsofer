import { describe, it, expect } from 'vitest'
import { normalizeZeout } from './nedarim'

// ⚠️ הבאג שהבדיקה הזו שומרת עליו:
// findClientByZeout השווה מחרוזות ת"ז בהשוואה מדויקת. אצלנו ת"ז נשמרת לעיתים
// בלי האפס המוביל ("12345678") ובנדרים היא מלאה ("012345678") — ולכן החיפוש
// החזיר null, המערכת ניסתה *להקים* משפחה שכבר קיימת, ונדרים דחו ב"מספר זהות
// זה כבר רשום אצל X". היולדת נשארה בלי כרטיס למרות מלאי מלא ומשפחה קיימת.

describe('normalizeZeout — השוואת ת"ז מול נדרים', () => {
  it('אפס מוביל חסר מתאים לת"ז המלאה', () => {
    expect(normalizeZeout('12345678')).toBe(normalizeZeout('012345678'))
  })

  it('מרפד תמיד ל-9 ספרות', () => {
    expect(normalizeZeout('12345678')).toBe('012345678')
    expect(normalizeZeout('1')).toBe('000000001')
    expect(normalizeZeout('123456789')).toBe('123456789')
  })

  it('מתעלם מרווחים ומקפים', () => {
    expect(normalizeZeout(' 012-345-678 ')).toBe('012345678')
    expect(normalizeZeout('012345678')).toBe(normalizeZeout('01 23 45 678'))
  })

  it('ערך ריק מחזיר מחרוזת ריקה (ולא "000000000")', () => {
    // ⚠️ קריטי: אם ריק היה הופך ל-000000000, כל משפחה בלי ת"ז הייתה
    // "מתאימה" לכל משפחה אחרת בלי ת"ז — ושיוך שגוי מטעין כסף ללקוח לא נכון.
    expect(normalizeZeout('')).toBe('')
    expect(normalizeZeout(null)).toBe('')
    expect(normalizeZeout(undefined)).toBe('')
    expect(normalizeZeout('   ')).toBe('')
  })

  it('דרכון אינו מרופד באפסים ואינו מתנגש בת"ז', () => {
    // "AB123456" בריפוד ספרות בלבד היה הופך ל-000123456 ועלול להתאים
    // בטעות לת"ז ישראלית אמיתית.
    expect(normalizeZeout('AB123456')).toBe('AB123456')
    expect(normalizeZeout('ab123456')).toBe('AB123456')
    expect(normalizeZeout('AB123456')).not.toBe(normalizeZeout('123456'))
  })
})
