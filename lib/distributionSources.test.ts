import { describe, it, expect } from 'vitest'
import { registrationSourceOf, registrationSourceLabel, REGISTRATION_SOURCE_LABEL, SOURCE_LABEL } from './distributionSources'

describe('registrationSourceOf', () => {
  it('מזהה כל ערוץ מוכר', () => {
    for (const key of Object.keys(REGISTRATION_SOURCE_LABEL)) {
      expect(registrationSourceOf(key)).toBe(key)
    }
  })

  it('מחזיר null לערך חסר או לא מוכר, ולא מציג אותו כמו-שהוא', () => {
    // ⚠️ רשומות מלפני העמודה — "לא תועד" נכון יותר מניחוש ערוץ
    expect(registrationSourceOf(null)).toBeNull()
    expect(registrationSourceOf('')).toBeNull()
    expect(registrationSourceOf('whatsapp')).toBeNull()
    expect(registrationSourceOf(undefined)).toBeNull()
  })

  it('מתעלם מרווחים מסביב', () => {
    expect(registrationSourceOf('  nedarim ')).toBe('nedarim')
  })
})

describe('registrationSourceLabel', () => {
  it('מציג את התווית בעברית', () => {
    expect(registrationSourceLabel('nedarim')).toBe('טופס נדרים פלוס')
    expect(registrationSourceLabel('portal')).toBe('רישום באתר')
  })

  it('מציג "לא תועד" כשאין ערוץ', () => {
    expect(registrationSourceLabel(null)).toBe('לא תועד')
  })
})

describe('שתי מערכות התוויות', () => {
  it('מכסות בדיוק את אותם ערוצים', () => {
    // ⚠️ ההרשמה לאיגוד והרישום לחלוקה חולקים את רשימת הערוצים. אם אחת תקבל
    // ערוץ חדש והשנייה לא, אותו ערוץ יוצג בשם אחד במסך אחד ובלי שם באחר.
    expect(Object.keys(REGISTRATION_SOURCE_LABEL).sort()).toEqual(Object.keys(SOURCE_LABEL).sort())
  })
})
