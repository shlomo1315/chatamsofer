import { describe, it, expect } from 'vitest'
import { categoryColor, DEFAULT_CATEGORY_COLOR } from './bookFairCategoryColor'

describe('categoryColor — צבע לכל קטגוריה', () => {
  it('מחזיר גוון ייעודי לקטגוריה מוכרת', () => {
    expect(categoryColor('שאלות ותשובות').main).toBe('#6B2737')
    expect(categoryColor('קורות חייו').main).toBe('#4A4A6A')
  })

  it('כל תשע הקטגוריות מקבלות גוון שונה זו מזו', () => {
    const names = ['שאלות ותשובות', 'דרוש ואגדה', 'על הש"ס', 'סידור ותהילים',
      'ליקוטים על התורה', 'שבת ומועדים', 'הלכה ומנהג',
      'ליקוטים בעניינים שונים', 'קורות חייו']
    const mains = names.map(n => categoryColor(n).main)
    expect(new Set(mains).size).toBe(9)
  })

  it('🔴 גרש עברי וגרשיים רגילים מתאימים לאותה קטגוריה', () => {
    // בלי הנרמול הזה "על הש״ס" היה נופל לברירת המחדל ומאבד את הגוון
    expect(categoryColor('על הש״ס')).toEqual(categoryColor('על הש"ס'))
    expect(categoryColor('על הש״ס').main).toBe('#2F5D50')
  })

  it('רווחים מיותרים אינם מפילים את ההתאמה', () => {
    expect(categoryColor('  שבת ומועדים  ').main).toBe('#A14B2A')
    expect(categoryColor('שבת  ומועדים').main).toBe('#A14B2A')
  })

  it('שם לא מוכר, ריק או חסר מקבל את גוון המותג', () => {
    expect(categoryColor('קטגוריה חדשה')).toEqual(DEFAULT_CATEGORY_COLOR)
    expect(categoryColor('')).toEqual(DEFAULT_CATEGORY_COLOR)
    expect(categoryColor(null)).toEqual(DEFAULT_CATEGORY_COLOR)
    expect(categoryColor(undefined)).toEqual(DEFAULT_CATEGORY_COLOR)
  })

  it('כל גוון הוא hex תקין בן 6 ספרות', () => {
    const names = ['שאלות ותשובות', 'על הש"ס', 'קורות חייו', 'לא קיים']
    for (const n of names) {
      const c = categoryColor(n)
      expect(c.main).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.soft).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})
