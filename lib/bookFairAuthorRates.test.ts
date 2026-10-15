import { describe, it, expect } from 'vitest'
import { computeAuthorPayouts, normalizeTitle } from './bookFairAuthorRates'
import { computeSold, refundNote } from './bookFairSold'
import { AUTHOR_RATES } from './bookFairAuthorRatesData'

const books = [
  { id: 'A', title: 'חת"ס על הש"ס — ברכות' },
  { id: 'B', title: 'דרשות חתם סופר' },
  { id: 'C', title: 'חוט המשולש על חולין' },
  { id: 'D', title: 'ספר ללא מחיר' },
  { id: 'E', title: 'כפול' }, { id: 'F', title: 'כפול' },
]
const rates = [
  ['מכון החתם סופר', "חת''ס על הש״ס - ברכות", 42],
  ['מכון החתם סופר', 'דרשות חתם סופר', 260.5],
  ['ללא מחבר / מו"ל', 'חוט המשולש על חולין', 50],
  ['ללא מחבר / מו"ל', 'פגום', null],
  ['מכון X', 'לא קיים בקטלוג', 10],
  ['מכון Y', 'כפול', 10],
] as const

describe('normalizeTitle', () => {
  it('מאחד גרשיים ומקפים', () => {
    expect(normalizeTitle('חת"ס על הש"ס — ברכות')).toBe(normalizeTitle("חת''ס על הש״ס - ברכות"))
  })
})

describe('computeAuthorPayouts', () => {
  it('כמות × מחיר, בלי ללא-מחבר, עם דיווח על לא מותאמים', () => {
    const p = computeAuthorPayouts(rates, books, { A: 3, B: 2, C: 5, D: 4, E: 1 })
    expect(p.parties).toHaveLength(1)
    expect(p.parties[0].amountAgorot).toBe(3 * 4200 + 2 * 26050)
    expect(p.totalAgorot).toBe(p.parties[0].amountAgorot)
    expect(p.unpaid).toEqual([{ bookId: 'C', title: 'חוט המשולש על חולין', qty: 5 }])
    expect(p.skipped).toEqual([{ party: 'ללא מחבר / מו"ל', title: 'פגום' }])
    expect(p.unmatched.map(u => [u.title, u.reason])).toEqual([['לא קיים בקטלוג', 'not_found'], ['כפול', 'ambiguous']])
    expect(p.unpriced.map(u => u.bookId)).toEqual(['D', 'E'])
  })

  it('זיכוי חלקי יורד מהכמות', () => {
    const sold = computeSold(
      [{ id: 'o1', status: 'partially_refunded', channel: 'web', order_number: '1002' }],
      [{ order_id: 'o1', book_id: 'A', quantity: 3, line_total_agorot: 12600 }],
      [{ book_id: 'A', delta: 1, note: refundNote('1002') }], [],
    )
    const p = computeAuthorPayouts(rates, books, { A: sold.A.total })
    expect(p.parties[0].books[0].qty).toBe(2)
    expect(p.totalAgorot).toBe(2 * 4200)
  })
})

describe('קובץ המחירים', () => {
  it('120 שורות, שורה אחת בלי מחיר', () => {
    expect(AUTHOR_RATES).toHaveLength(120)
    expect(AUTHOR_RATES.filter(r => r[2] === null)).toHaveLength(1)
  })
})
