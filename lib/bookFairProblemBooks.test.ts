import { describe, it, expect } from 'vitest'
import { parseProblemBooks, setProblemBook, ordersWithProblemBooks } from './bookFairProblemBooks'

describe('parseProblemBooks', () => {
  it('ערך ריק או חסר = אין ספרים בעייתיים', () => {
    expect(parseProblemBooks(null)).toEqual({})
    expect(parseProblemBooks('')).toEqual({})
  })

  // 🔴 הבאג הידוע של app_settings: אובייקט שנשמר בלי stringify
  it('"[object Object]" אינו מפיל את המסך', () => {
    expect(parseProblemBooks('[object Object]')).toEqual({})
  })

  it('מערך או ערך שאינו אובייקט נדחים', () => {
    expect(parseProblemBooks('[1,2]')).toEqual({})
    expect(parseProblemBooks('"x"')).toEqual({})
  })

  it('קורא סימון תקין ומנקה הערה ריקה', () => {
    const raw = JSON.stringify({ a: { note: '  ', at: '2026-10-07' }, b: { note: 'חסר', at: 't' } })
    expect(parseProblemBooks(raw)).toEqual({
      a: { note: null, at: '2026-10-07' },
      b: { note: 'חסר', at: 't' },
    })
  })
})

describe('setProblemBook', () => {
  it('מסמן ומסיר בלי לשנות את המקור', () => {
    const base = {}
    const marked = setProblemBook(base, 'x', true, 'פגום', 'now')
    expect(marked).toEqual({ x: { note: 'פגום', at: 'now' } })
    expect(base).toEqual({})
    expect(setProblemBook(marked, 'x', false, null, 'later')).toEqual({})
  })
})

describe('ordersWithProblemBooks', () => {
  it('מחזיר רק הזמנות שיש בהן ספר בעייתי, בלי כפילויות', () => {
    expect(ordersWithProblemBooks(
      { o1: ['b1', 'b2', 'b1'], o2: ['b2'], o3: [] },
      ['b1'],
    )).toEqual({ o1: ['b1'] })
  })

  it('בלי ספרים בעייתיים — אין התאמות', () => {
    expect(ordersWithProblemBooks({ o1: ['b1'] }, [])).toEqual({})
  })
})
