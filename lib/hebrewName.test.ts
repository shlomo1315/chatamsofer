import { describe, it, expect } from 'vitest'
import { stripTitles, phoneticKey, normalizeName, namesMatch } from './hebrewName'

describe('stripTitles — הסרת תארים לפני/אחרי השם', () => {
  it('מסיר הרב/רבי לפני וזצ"ל אחרי', () => {
    expect(stripTitles('הרב רבי שמעון סופר זצ"ל')).toBe('שמעון סופר')
  })
  it('מסיר ר\' ושליט"א', () => {
    expect(stripTitles("ר' יצחק שליט\"א")).toBe('יצחק')
  })
  it('שם ללא תארים נשאר כמות שהוא', () => {
    expect(stripTitles('משה פרידמן')).toBe('משה פרידמן')
  })
  it('מסיר ניקוד', () => {
    expect(stripTitles('שִׁמְעוֹן')).toBe('שמעון')
  })
})

describe('phoneticKey — צליל דומה', () => {
  it('פרידמן = פרידמאן (אם קריאה פנימית)', () => {
    expect(phoneticKey('פרידמן')).toBe(phoneticKey('פרידמאן'))
  })
  it('שמעון = שימעון', () => {
    expect(phoneticKey('שמעון')).toBe(phoneticKey('שימעון'))
  })
  it('שמות שונים → מפתח שונה', () => {
    expect(phoneticKey('שמעון')).not.toBe(phoneticKey('ראובן'))
  })
  it('אינו ממזג שמות רחוקים (אהרן ≠ רון)', () => {
    expect(phoneticKey('אהרן')).not.toBe(phoneticKey('רון'))
  })
})

describe('namesMatch — התאמה מנורמלת או פונטית', () => {
  it('מתעלם מתארים', () => {
    expect(namesMatch('הרב שמעון סופר זצ"ל', 'שמעון סופר')).toBe(true)
  })
  it('תופס צליל דומה', () => {
    expect(namesMatch('פרידמן', 'פרידמאן')).toBe(true)
  })
  it('שמות שונים אינם תואמים', () => {
    expect(namesMatch('שמעון סופר', 'ראובן כהן')).toBe(false)
  })
  it('ריק אינו תואם', () => {
    expect(namesMatch('', 'שמעון')).toBe(false)
  })
})

describe('normalizeName', () => {
  it('מנקה תארים, ניקוד ופיסוק', () => {
    expect(normalizeName('רבי שמעון, סופר')).toBe('שמעון סופר')
  })
})
