import { describe, it, expect } from 'vitest'
import { layoutSideTitle, splitBalanced, SIDE_TITLE } from './bookFairSideTitle'

// מדידה מדומה: כל תו = 0.5 × גודל הגופן (קירוב סביר ל-Heebo)
const measure = (t: string, size: number) => t.length * size * 0.5
const AVAILABLE = 86 // ~גובה תווית פחות שוליים

describe('🔴 layoutSideTitle — כל הטקסט נכנס', () => {
  it('שם קצר — שורה אחת בגודל המלא', () => {
    const l = layoutSideTitle('חוט המשולש', measure, AVAILABLE)
    expect(l.lines).toEqual(['חוט המשולש'])
    expect(l.size).toBe(SIDE_TITLE.max)
  })

  it('שם בינוני — שורה אחת מוקטנת', () => {
    const t = 'שבת בהיכלו של החתם סופר' // 23 תווים
    const l = layoutSideTitle(t, measure, AVAILABLE)
    expect(l.lines).toHaveLength(1)
    expect(l.size).toBeLessThan(SIDE_TITLE.max)
    expect(l.size).toBeGreaterThanOrEqual(SIDE_TITLE.minOneLine)
  })

  it('🔴 שם ארוך — שתי שורות', () => {
    const t = 'תהילים היכל החתם סופר - קטן עם פירוש מלא'
    const l = layoutSideTitle(t, measure, AVAILABLE)
    expect(l.lines).toHaveLength(2)
    expect(l.lines.join(' ')).toBe(t)
  })

  it('🔴 תמיד נכנס במלואו — אף שורה לא חורגת', () => {
    for (const t of [
      'קצר',
      'שבת בהיכלו של החתם סופר',
      'תהילים היכל החתם סופר - קטן עם פירוש מלא',
      'שאלות ותשובות חתם סופר חלק ראשון אורח חיים ויורה דעה מהדורה חדשה ומתוקנת עם מפתחות',
    ]) {
      const l = layoutSideTitle(t, measure, AVAILABLE)
      for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(AVAILABLE + 0.001)
      expect(l.lines.join(' ')).toBe(t)
    }
  })

  it('מילה אחת ארוכה מאוד — מוקטנת עד שנכנסת', () => {
    const t = 'א'.repeat(80)
    const l = layoutSideTitle(t, measure, AVAILABLE)
    expect(measure(l.lines[0], l.size)).toBeLessThanOrEqual(AVAILABLE + 0.001)
  })
})

describe('splitBalanced', () => {
  it('שבירה מאוזנת', () => {
    expect(splitBalanced('אאאא בבבב גגגג דדדד', measure, 8)).toEqual(['אאאא בבבב', 'גגגג דדדד'])
  })
  it('מילה בודדת — אין שבירה', () => {
    expect(splitBalanced('אחת', measure, 8)).toBeNull()
  })
})
