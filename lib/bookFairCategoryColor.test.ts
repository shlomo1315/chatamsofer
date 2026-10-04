import { describe, it, expect } from 'vitest'
import { categoryColor, DEFAULT_CATEGORY_COLOR } from './bookFairCategoryColor'

describe('categoryColor — צבע לכל קטגוריה', () => {
  it('מחזיר גוון ייעודי לקטגוריה מוכרת', () => {
    expect(categoryColor('שאלות ותשובות').main).toBe('#101030')
    expect(categoryColor('קורות חייו').main).toBe('#13263F')
  })

  // 🔴 הפלטה נגזרת מהלוגו: כחול־לילה וזהב. גוון שאינו כחלחל (רכיב
  // כחול שאינו הגבוה) מעיד שמישהו הוסיף צבע שאינו שייך למותג.
  it('🔴 כל הגוונים כחלחלים — נגזרים מהלוגו', () => {
    const names = ['שאלות ותשובות', 'דרוש ואגדה', 'על הש"ס', 'סידור ותהילים',
      'ליקוטים על התורה', 'שבת ומועדים', 'הלכה ומנהג',
      'ליקוטים בעניינים שונים', 'קורות חייו']
    for (const n of names) {
      const hex = categoryColor(n).main
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      expect(b, `${n} (${hex}) — הכחול חייב להיות הרכיב החזק`).toBeGreaterThanOrEqual(Math.max(r, g))
    }
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
    expect(categoryColor('על הש״ס').main).toBe('#20406B')
  })

  it('רווחים מיותרים אינם מפילים את ההתאמה', () => {
    expect(categoryColor('  שבת ומועדים  ').main).toBe('#2E2F63')
    expect(categoryColor('שבת  ומועדים').main).toBe('#2E2F63')
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
