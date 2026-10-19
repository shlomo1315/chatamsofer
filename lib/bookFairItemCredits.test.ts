import { describe, it, expect } from 'vitest'
import { parseItemCreditsTable, matchItemCredits, creditsAsReturns, cleanOrderNumber, isOrderPaid, buildCreditUploadRows, creditUploadCells, CREDIT_UPLOAD_HEADERS } from './bookFairItemCredits'
import { parseCreditsTable } from './bookFairCredits'

describe('isOrderPaid', () => {
  it('מקבל סטטוסים ששולמו ודוחה אחרים', () => {
    expect(isOrderPaid('paid')).toBe(true)
    expect(isOrderPaid('shipped')).toBe(true)
    expect(isOrderPaid('cancelled')).toBe(false)
    expect(isOrderPaid('pending')).toBe(false)
  })
})
import { computeSold } from './bookFairSold'

const orders = [
  { id: 'o1', order_number: 'BF-100', status: 'paid' },
  { id: 'o2', order_number: 'BF-101', status: 'cancelled' },
]
const items = [
  { id: 'i1', order_id: 'o1', book_id: 'b1', title_snapshot: 'שו"ת חתם סופר א', quantity: 2 },
  { id: 'i2', order_id: 'o1', book_id: 'b2', title_snapshot: 'תורת משה', quantity: 1 },
  { id: 'i3', order_id: 'o2', book_id: 'b1', title_snapshot: 'שו"ת חתם סופר א', quantity: 1 },
]

describe('parseItemCreditsTable', () => {
  it('קורא כותרות, כמות ברירת מחדל 1 ומספר הזמנה מספרי', () => {
    const r = parseItemCreditsTable([['מספר הזמנה', 'שם ספר', 'כמות'], [100.0, 'תורת משה', ''], ['BF-100', 'x', 2]])
    expect(r.credits).toEqual([
      { line: 2, order_number: '100', book: 'תורת משה', quantity: 1 },
      { line: 3, order_number: 'BF-100', book: 'x', quantity: 2 },
    ])
  })
  it('מדווח על עמודות חסרות, כמות לא תקינה ושורות חסרות', () => {
    expect(parseItemCreditsTable([['שם ספר'], ['a']]).missingColumns).toEqual(['מספר הזמנה'])
    const r = parseItemCreditsTable([['הזמנה', 'ספר', 'כמות'], ['1', 'a', 'abc'], ['', 'a', 1], ['2', '', 1]])
    expect(r.errors.map(e => e.line)).toEqual([2, 3, 4])
  })
  it('מנקה מספר הזמנה', () => { expect(cleanOrderNumber(' #12.0 ')).toBe('12') })
})

describe('matchItemCredits', () => {
  const parse = (rows: unknown[][]) => parseItemCreditsTable([['מספר הזמנה', 'שם ספר', 'כמות'], ...rows]).credits
  it('מתאים לפי שם מנורמל (גרשיים וסימנים)', () => {
    const { matched, unmatched } = matchItemCredits(parse([['BF-100', 'שות חתם סופר א', 1]]), orders, items)
    expect(unmatched).toEqual([])
    expect(matched[0]).toMatchObject({ item_id: 'i1', quantity: 1, order_id: 'o1' })
  })
  it('שורות כפולות מצטברות, ועודף כמות נדחה', () => {
    expect(matchItemCredits(parse([['BF-100', 'תורת משה', 1], ['BF-100', 'תורת משה', 1]]), orders, items).unmatched[0].reason).toMatch(/כמות/)
    const { matched } = matchItemCredits(parse([['BF-100', 'שו"ת חתם סופר א', 1], ['BF-100', 'שו"ת חתם סופר א', 1]]), orders, items)
    expect(matched[0].quantity).toBe(2)
  })
  it('סיבות: הזמנה לא קיימת, לא שולמה, ספר לא בהזמנה', () => {
    const r = matchItemCredits(parse([['BF-999', 'תורת משה', 1], ['BF-101', 'שו"ת חתם סופר א', 1], ['BF-100', 'ספר אחר', 1]]), orders, items)
    expect(r.matched).toEqual([])
    expect(r.unmatched.map(u => u.reason)).toEqual([
      'מספר הזמנה לא נמצא', expect.stringMatching(/ששולם/), 'שם הספר לא נמצא בהזמנה',
    ])
  })
  it('שם שמתאים לכמה ספרים שונים אינו מנוחש', () => {
    const two = [...items, { id: 'i4', order_id: 'o1', book_id: 'b3', title_snapshot: 'תורת אמת', quantity: 1 }]
    expect(matchItemCredits(parse([['BF-100', 'תורת', 1]]), orders, two).unmatched[0].reason).toMatch(/כמה ספרים/)
  })
})

describe('כניסה לחישוב נמכר', () => {
  it('ספר שזוכה יורד מהנמכר בפועל, ואינו עובר את הכמות שהוזמנה', () => {
    const soldOrders = [{ id: 'o1', status: 'paid', channel: 'web', order_number: 'BF-100' }]
    const soldItems = [{ order_id: 'o1', book_id: 'b1', quantity: 2, line_total_agorot: 2000 }]
    const marks = creditsAsReturns([{ order_number: 'BF-100', book_id: 'b1', quantity: 1 }])
    const s = computeSold(soldOrders, soldItems, marks, [])
    expect(s.b1).toMatchObject({ web: 1, returned: 1, collected: 1000 })
    const over = computeSold(soldOrders, soldItems, creditsAsReturns([{ order_number: 'BF-100', book_id: 'b1', quantity: 5 }]), [])
    expect(over.b1.web).toBe(0)
  })
})

describe('buildCreditUploadRows', () => {
  const base = { customer_name: 'כהן', customer_phone: '050-1234567', customer_email: null, unit_price_agorot: 5000 }
  it('מאחד לפי לקוח: ספרים, כמויות וסכום מלא', () => {
    const rows = buildCreditUploadRows([
      { ...base, order_number: '101', title: 'ספר א', quantity: 2 },
      { ...base, order_number: '102', title: 'ספר ב', quantity: 1, unit_price_agorot: 3550 },
      { ...base, order_number: '102', title: 'ספר א', quantity: 1 },
    ], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ phone: '0501234567', email: null, channel: 'phone', books: 'ספר א ×3, ספר ב', amount_agorot: 18550, orders: '101, 102', status: 'לא הועלה' })
  })
  it('מייל קודם לטלפון, ולקוחות שונים בשורות נפרדות', () => {
    const rows = buildCreditUploadRows([
      { ...base, customer_email: 'A@x.co', order_number: '1', title: 'ס', quantity: 1 },
      { ...base, customer_phone: '0521111111', order_number: '2', title: 'ס', quantity: 1 },
    ], [{ channel: 'email', phone: null, email: 'a@x.co', status: 'sent', transferred_at: '2026-10-19' }])
    expect(rows.map(r => [r.channel, r.email ?? r.phone, r.status])).toEqual([
      ['email', 'a@x.co', 'הועבר בבנק'], ['phone', '0521111111', 'לא הועלה'],
    ])
  })
  it('הקובץ עובר כמו שהוא בהעלאה של זיכוי על ספרים חסרים', () => {
    const rows = buildCreditUploadRows([
      { ...base, order_number: '1', title: 'ספר', quantity: 1 },
      { ...base, customer_phone: null, customer_email: 'b@x.co', order_number: '2', title: 'ספר', quantity: 1 },
    ], [])
    const table = [CREDIT_UPLOAD_HEADERS as readonly unknown[], ...rows.map(creditUploadCells)]
    const parsed = parseCreditsTable(table as unknown[][])
    expect(parsed.errors).toEqual([])
    expect(parsed.credits.map(c => [c.channel, c.amount_agorot, c.books])).toEqual([['phone', 5000, 'ספר'], ['email', 5000, 'ספר']])
  })
})
