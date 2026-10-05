import { describe, it, expect } from 'vitest'
import { layoutSideTitle, splitBalanced, splitInto, SIDE_TITLE } from './bookFairSideTitle'

// מדידה מדומה: כל תו = 0.5 × גודל הגופן (קירוב סביר ל-Heebo)
const measure = (t: string, size: number) => t.length * size * 0.5
const TALL = 86   // תווית רגילה
const SPINE = 41  // תווית לגב ספר צר (~17 מ"מ)

const TITLES = [
  'קצר',
  'שירת משה',
  'זמירות שבת עם ספרא דשבתא',
  'דרשות חתם סופר מבואר שביעי של פסח וספירת העומר',
  'תורת חתם סופר מועדים - עשרת ימי תשובה יום כיפור וסוכות',
  'שאלות ותשובות חתם סופר חלק ראשון אורח חיים ויורה דעה מהדורה חדשה ומתוקנת עם מפתחות',
]

describe('🔴 layoutSideTitle — כל הטקסט נכנס, תמיד', () => {
  for (const available of [TALL, SPINE]) {
    it(`אף שורה לא חורגת ושום מילה לא נחתכת (אורך ${available})`, () => {
      for (const t of TITLES) {
        const l = layoutSideTitle(t, measure, available)
        for (const line of l.lines) expect(measure(line, l.size)).toBeLessThanOrEqual(available + 0.001)
        expect(l.lines.join(' ')).toBe(t)
        expect(l.lines.length).toBeLessThanOrEqual(SIDE_TITLE.maxLines)
      }
    })
  }

  it('שם קצר בתווית רגילה — שורה אחת בגודל המלא', () => {
    const l = layoutSideTitle('חוט המשולש', measure, TALL)
    expect(l.lines).toHaveLength(1)
    expect(l.size).toBe(SIDE_TITLE.max)
  })

  it('🔴 גב ספר צר — שם ארוך מתפרס על יותר משתי שורות ונשאר קריא', () => {
    const l = layoutSideTitle(TITLES[4], measure, SPINE)
    expect(l.lines.length).toBeGreaterThan(2)
    expect(l.size).toBeGreaterThanOrEqual(SIDE_TITLE.minMulti)
  })
})

describe('splitInto', () => {
  it('פיצול מאוזן לשתיים ולשלוש', () => {
    expect(splitBalanced('אאאא בבבב גגגג דדדד', measure, 8)).toEqual(['אאאא בבבב', 'גגגג דדדד'])
    expect(splitInto('א ב ג ד ה ו', 3, measure, 8)).toEqual(['א ב', 'ג ד', 'ה ו'])
  })
  it('פחות מילים משורות — אין פיצול', () => {
    expect(splitInto('אחת', 2, measure, 8)).toBeNull()
  })
})
