import { describe, it, expect } from 'vitest'
import { unsuppliedBooks, creditMentions, type UnsuppliedCredit } from './bookFairUnsupplied'

const order = { order_number: 'BF-26-0417', customer_phone: '050-1234567', customer_email: 'A@B.co.il' }
const items = [
  { id: 'i1', book_id: 'b1', title_snapshot: 'שו"ת חתם סופר', quantity: 2 },
  { id: 'i2', book_id: 'b2', title_snapshot: 'דרשות חתם סופר', quantity: 1 },
  { id: 'i3', book_id: 'b3', title_snapshot: 'תורת משה', quantity: 1 },
  { id: 'i4', book_id: 'b4', title_snapshot: 'ספר תקין', quantity: 1 },
]
const credit = (o: Partial<UnsuppliedCredit>): UnsuppliedCredit =>
  ({ id: 'c1', phone: '0501234567', email: null, books: '', amount_agorot: 5000, status: 'sent', ...o })

describe('unsuppliedBooks', () => {
  it('מסמן זוכה, בתהליך זיכוי ולא זוכה, ומדלג על ספר שסופק', () => {
    const r = unsuppliedBooks(
      order, items,
      [{ book_id: 'b1', delta: 1, note: 'זיכוי הזמנה BF-26-0417' }, { book_id: 'b4', delta: 1, note: 'זיכוי הזמנה BF-26-9999' }],
      [credit({ books: 'דרשות חתם סופר, ספר אחר' })],
      new Set(['b3']),
    )
    expect(r.lines).toEqual([
      { itemId: 'i1', title: 'שו"ת חתם סופר', quantity: 1, state: 'done', detail: 'זוכה בהזמנה' },
      { itemId: 'i2', title: 'דרשות חתם סופר', quantity: 1, state: 'in_progress', detail: 'זיכוי ללקוח: נשלח ללקוח' },
      { itemId: 'i3', title: 'תורת משה', quantity: 1, state: 'none', detail: 'סומן בעייתי במלאי' },
    ])
    expect(r.otherCredits).toEqual([])
  })

  it('מתאים זיכוי לפי מייל, ומחזיר זיכוי של הלקוח שלא הותאם לספר', () => {
    const c = credit({ id: 'c2', phone: null, email: 'a@b.co.il', books: 'ספר שלא בהזמנה' })
    const r = unsuppliedBooks(order, items, [], [c, credit({ id: 'c3', phone: '0529999999', books: 'תורת משה' })], new Set())
    expect(r.lines).toEqual([])
    expect(r.otherCredits.map(x => x.id)).toEqual(['c2'])
  })
})

describe('creditMentions', () => {
  it('מתעלם מגרשיים ומרווחים', () => {
    expect(creditMentions('שות חתם  סופר; משהו', 'שו"ת חתם סופר')).toBe(true)
    expect(creditMentions('חתם סופר', 'שו"ת חתם סופר')).toBe(true)
    expect(creditMentions('תורת משה', 'שו"ת חתם סופר')).toBe(false)
  })
})
