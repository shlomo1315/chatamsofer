import { describe, it, expect } from 'vitest'
import { layoutStickerTitle } from './bookFairStickerTitle'

// מדידה מקורבת: רוחב אות = 0.55 × הגודל.
const measure = (t: string, s: number) => t.length * s * 0.55

describe('🔴 layoutStickerTitle — כל השם נכנס, תמיד', () => {
  const W = 186
  const H = 28

  it('שם קצר — גודל מלא, שורה אחת', () => {
    const l = layoutStickerTitle('שו"ת חתם סופר', measure, W, H)
    expect(l.size).toBe(11)
    expect(l.lines).toEqual(['שו"ת חתם סופר'])
  })

  it('שם בינוני — שתי שורות', () => {
    const l = layoutStickerTitle('חידושי חתם סופר על מסכת גיטין וקידושין', measure, W, H)
    expect(l.lines.length).toBeLessThanOrEqual(2)
    expect(l.lines.join(' ')).toBe('חידושי חתם סופר על מסכת גיטין וקידושין')
  })

  it.each([
    'ספר זכרון לרבינו החתם סופר זצוקללה"ה כולל תולדות חייו ומכתבים ואגרות קודש שלא נדפסו מעולם',
    'א'.repeat(80),
  ])('שם ארוך מאוד נכנס ברוחב ובגובה בלי לחתוך: %s', title => {
    const l = layoutStickerTitle(title, measure, W, H)
    expect(l.lines.join(' ').replace(/\s/g, '')).toBe(title.replace(/\s/g, ''))
    for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(W + 0.001)
    expect(l.height).toBeLessThanOrEqual(H + 0.001)
  })
})
