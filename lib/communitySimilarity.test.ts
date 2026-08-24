import { describe, it, expect } from 'vitest'
import { normalizeForCompare, similarity, suggestGroups } from './communitySimilarity'

// 🔴 במאגר 1,928 ערכי קהילה ל-7,108 משפחות, כי השדה הוא טקסט חופשי.
// "ליטאי"(495) · "ליטאים"(311) · "ליטאית"(67) · "לטאי"(45) הם קהילה
// אחת של 918 משפחות המפוצלת לארבע רשומות.
//
// ⚠️ המודול *מציע* בלבד — המיזוג עצמו ידני, כי איחוד אוטומטי היה מאחד
// בטעות קהילות שנכתבות דומה בלי שהמשתמש יידע.

describe('normalizeForCompare', () => {
  it('מסיר גרש וגרשיים', () => {
    expect(normalizeForCompare("ויז'ניץ")).toBe(normalizeForCompare('ויזניץ'))
  })

  it('מאחד רווחים כפולים ורווחי קצה', () => {
    expect(normalizeForCompare('  תולדות   אהרן ')).toBe(normalizeForCompare('תולדות אהרן'))
  })

  it('מסיר סיומות ריבוי ונקבה', () => {
    const base = normalizeForCompare('ליטאי')
    expect(normalizeForCompare('ליטאים')).toBe(base)
    expect(normalizeForCompare('ליטאית')).toBe(base)
  })

  it('ערך ריק אינו מפיל', () => {
    expect(normalizeForCompare('')).toBe('')
  })
})

describe('similarity', () => {
  it('זהים = 1', () => {
    expect(similarity('גור', 'גור')).toBe(1)
  })

  it('ליטאי ולטאי דומים מאוד', () => {
    expect(similarity('ליטאי', 'לטאי')).toBeGreaterThan(0.7)
  })

  it('🔴 שמות קצרים ושונים אינם דומים', () => {
    // גור/גז שניהם קצרים; מרחק עריכה מוחלט היה מסמן אותם כדומים.
    expect(similarity('גור', 'גז')).toBeLessThan(0.7)
  })

  it('קהילות שונות לגמרי', () => {
    expect(similarity('בעלזא', 'סאטמאר')).toBeLessThan(0.5)
  })
})

describe('suggestGroups', () => {
  const items = [
    { name: 'ליטאי', count: 495 },
    { name: 'ליטאים', count: 311 },
    { name: 'ליטאית', count: 67 },
    { name: 'לטאי', count: 45 },
    { name: 'בעלזא', count: 369 },
    { name: 'גור', count: 216 },
  ]

  it('🔴 ארבע גרסאות ליטאי נופלות לקבוצה אחת', () => {
    const groups = suggestGroups(items)
    const lit = groups.find(g => g.members.some(m => m.name === 'ליטאי'))
    expect(lit).toBeDefined()
    expect(lit!.members).toHaveLength(4)
    expect(lit!.totalFamilies).toBe(918)
  })

  it('השם המוצע הוא הגרסה הנפוצה ביותר', () => {
    const groups = suggestGroups(items)
    const lit = groups.find(g => g.members.some(m => m.name === 'ליטאי'))
    expect(lit!.suggestedName).toBe('ליטאי')
  })

  it('⚠️ קהילה בלי דומים אינה מוצעת כקבוצה', () => {
    // קבוצה של אחד היא רעש — המשתמש היה עובר על 134 שורות מיותרות.
    const groups = suggestGroups(items)
    expect(groups.every(g => g.members.length >= 2)).toBe(true)
  })

  it('בעלזא וגור אינם מקובצים יחד', () => {
    const groups = suggestGroups(items)
    const belz = groups.find(g => g.members.some(m => m.name === 'בעלזא'))
    expect(belz).toBeUndefined()
  })

  it('רשימה ריקה מחזירה מערך ריק', () => {
    expect(suggestGroups([])).toEqual([])
  })

  it('הקבוצות ממוינות לפי מספר המשפחות — הגדולה קודם', () => {
    const many = [
      { name: 'אאא', count: 5 }, { name: 'אאאא', count: 6 },
      { name: 'ליטאי', count: 495 }, { name: 'ליטאים', count: 311 },
    ]
    const groups = suggestGroups(many)
    expect(groups[0].totalFamilies).toBeGreaterThan(groups[1].totalFamilies)
  })
})
