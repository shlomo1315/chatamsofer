import { describe, it, expect } from 'vitest'
import { netOf, partyOf, buildBookRows, groupByParty, partyStatus, NO_PARTY, type AuthorPayment } from './bookFairSettlement'

const books = [
  { id: 'a', sku: '1', title: 'שו"ת א', author: 'ר׳ משה', publisher: 'מכון חתם סופר' },
  { id: 'b', sku: '2', title: 'דרשות', author: 'ר׳ משה', publisher: null },
  { id: 'c', sku: '3', title: 'חידושים', author: null, publisher: 'מכון חתם סופר' },
  { id: 'd', sku: '4', title: 'לא נמכר', author: 'x', publisher: null },
  { id: 'e', sku: '5', title: 'בלי גורם', author: ' ', publisher: null },
]

describe('netOf', () => {
  it('מפחית 5% ומעגל לאגורה', () => {
    expect(netOf(10000)).toBe(9500)
    expect(netOf(333)).toBe(316) // 316.35
    expect(netOf(0)).toBe(0)
  })
})

describe('partyOf', () => {
  it('מו"ל קודם, אחריו מחבר, ואחרת "ללא"', () => {
    expect(partyOf(books[0])).toBe('מכון חתם סופר')
    expect(partyOf(books[1])).toBe('ר׳ משה')
    expect(partyOf(books[4])).toBe(NO_PARTY)
  })
})

describe('buildBookRows', () => {
  const sales = [
    { book_id: 'a', qty: 10, collected_agorot: 100000 },
    { book_id: 'b', qty: 2, collected_agorot: 9000 },
    { book_id: 'c', qty: 1, collected_agorot: 5000 },
  ]

  it('מחיל התאמה ידנית על הכמות ועל הסכום', () => {
    const rows = buildBookRows(books, sales, [{ book_id: 'a', delta: -1, amount_agorot: -10000 }])
    const a = rows.find(r => r.bookId === 'a')!
    expect(a).toMatchObject({ orderedQty: 10, adjQty: -1, qty: 9, collected: 90000, net: 85500 })
  })

  it('ספר בלי מכירות ובלי התאמה אינו מופיע', () => {
    expect(buildBookRows(books, sales, []).map(r => r.bookId).sort()).toEqual(['a', 'b', 'c'])
  })

  it('התאמה גדולה מהמכירות אינה יורדת מתחת לאפס', () => {
    const rows = buildBookRows(books, [], [{ book_id: 'd', delta: -3, amount_agorot: -300 }])
    expect(rows[0]).toMatchObject({ qty: 0, collected: 0, net: 0 })
  })

  it('סיכום לפי גורם עם תשלומים, בלי תשלום שבוטל', () => {
    const rows = buildBookRows(books, sales, [])
    const pays: AuthorPayment[] = [
      { id: '1', payee: 'מכון חתם סופר', amount_agorot: 50000, method: 'transfer', paid_on: '2026-10-14', note: null, cancelled_at: null },
      { id: '2', payee: 'מכון חתם סופר', amount_agorot: 7000, method: 'cash', paid_on: '2026-10-14', note: null, cancelled_at: null },
      { id: '3', payee: 'מכון חתם סופר', amount_agorot: 99999, method: 'check', paid_on: '2026-10-14', note: null, cancelled_at: '2026-10-14' },
      { id: '4', payee: 'מחבר חדש', amount_agorot: 1000, method: 'check', paid_on: '2026-10-14', note: null, cancelled_at: null },
    ]
    const parties = groupByParty(rows, pays)
    const inst = parties.find(p => p.party === 'מכון חתם סופר')!
    expect(inst).toMatchObject({ books: 2, qty: 11, collected: 105000, net: 99750, paid: 57000, balance: 42750 })
    expect(inst.byMethod).toEqual({ transfer: 50000, cash: 7000 })
    expect(parties.find(p => p.party === 'ר׳ משה')).toMatchObject({ books: 1, net: 8550, paid: 0, balance: 8550 })
    expect(parties.find(p => p.party === 'מחבר חדש')).toMatchObject({ books: 0, balance: -1000 })
  })
})

describe('partyStatus', () => {
  it('מצב לפי יתרה ותשלומים', () => {
    expect(partyStatus({ party: NO_PARTY, paid: 0, balance: 100 })).toBe('missing')
    expect(partyStatus({ party: 'א', paid: 100, balance: 0 })).toBe('paid')
    expect(partyStatus({ party: 'א', paid: 200, balance: -100 })).toBe('paid')
    expect(partyStatus({ party: 'א', paid: 50, balance: 50 })).toBe('partial')
    expect(partyStatus({ party: 'א', paid: 0, balance: 50 })).toBe('unpaid')
  })
})
