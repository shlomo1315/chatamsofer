import { describe, it, expect } from 'vitest'
import { computeSold, itemsAfterReturns, refundNote, type SoldOrder, type SoldItem } from './bookFairSold'

const orders: SoldOrder[] = [
  { id: 'w1', status: 'paid', channel: 'web', order_number: '1001' },
  { id: 'w2', status: 'partially_refunded', channel: 'web', order_number: '1002' },
  { id: 'p1', status: 'delivered', channel: 'phone', order_number: '1003' },
  { id: 'f1', status: 'paid', channel: 'fair', order_number: '1004' },
  { id: 'x1', status: 'cancelled', channel: 'web', order_number: '1005' },
  { id: 'x2', status: 'refunded', channel: 'phone', order_number: '1006' },
  { id: 'x3', status: 'pending_payment', channel: 'web', order_number: 'TMP-1' },
]
const items: SoldItem[] = [
  { order_id: 'w1', book_id: 'A', quantity: 2, line_total_agorot: 2000 },
  // ⚠️ אותו ספר בשתי שורות באותה הזמנה
  { order_id: 'w2', book_id: 'A', quantity: 1, line_total_agorot: 1000 },
  { order_id: 'w2', book_id: 'A', quantity: 2, line_total_agorot: 2000 },
  { order_id: 'w2', book_id: 'B', quantity: 1, line_total_agorot: 500 },
  { order_id: 'p1', book_id: 'A', quantity: 1, line_total_agorot: 1000 },
  { order_id: 'f1', book_id: 'A', quantity: 4, line_total_agorot: 4000 },
  { order_id: 'x1', book_id: 'A', quantity: 9, line_total_agorot: 9000 },
  { order_id: 'x2', book_id: 'A', quantity: 9, line_total_agorot: 9000 },
  { order_id: 'x3', book_id: 'A', quantity: 9, line_total_agorot: 9000 },
]
const returns = [
  { book_id: 'A', delta: 1, note: refundNote('1002') },
  // מחיקת הזמנה: לא נוגע במכירות
  { book_id: 'A', delta: 9, note: 'מחיקת הזמנה 1005' },
]

describe('computeSold — מקור אחד ל"נמכר"', () => {
  const s = computeSold(orders, items, returns, [{ book_id: 'A', delta: -1, amount_agorot: -1000 }])

  it('🔴 דוכן + טלפון + אתר = סך הכל, לכל ספר', () => {
    for (const b of Object.values(s)) expect(b.fair + b.phone + b.web).toBe(b.total)
  })

  it('סופר רק הזמנות ששולמו, כולל זוכה חלקית', () => {
    // אתר: 2 (w1) + 3 (w2) - 1 שהוחזר = 4
    expect(s.A.web).toBe(4)
    expect(s.A.phone).toBe(1)
    expect(s.A.fairOrders).toBe(4)
  })

  it('ההתאמה הידנית נכנסת לדוכן', () => {
    expect(s.A.adj).toBe(-1)
    expect(s.A.fair).toBe(3)
    expect(s.A.total).toBe(8)
  })

  it('עותק שהוחזר בזיכוי חלקי יורד גם מהכמות וגם מהנגבה', () => {
    expect(s.A.returned).toBe(1)
    // 2000 + (3000 × 2/3) + 1000 + 4000 - 1000
    expect(s.A.collected).toBe(8000)
    expect(s.B.web).toBe(1)
  })

  it('החזרה לעולם לא גדולה ממה שנקנה', () => {
    const r = computeSold(orders, items, [{ book_id: 'B', delta: 5, note: refundNote('1002') }], [])
    expect(r.B.web).toBe(0)
    expect(r.B.returned).toBe(1)
  })

  it('ספר עם התאמה בלבד מופיע', () => {
    const r = computeSold([], [], [], [{ book_id: 'C', delta: 2, amount_agorot: 600 }])
    expect(r.C).toMatchObject({ fair: 2, total: 2, collected: 600 })
  })
})

describe('itemsAfterReturns — ללוח הבקרה', () => {
  it('מוריד את העותקים שהוחזרו, ושורה שהוחזרה במלואה נעלמת', () => {
    const out = itemsAfterReturns(orders, items, [{ book_id: 'A', delta: 2, note: refundNote('1002') }])
    const w2 = out.filter(i => i.order_id === 'w2' && i.book_id === 'A')
    expect(w2).toEqual([{ order_id: 'w2', book_id: 'A', quantity: 1, line_total_agorot: 1000 }])
  })

  it('בלי החזרות מחזיר את אותה רשימה', () => {
    expect(itemsAfterReturns(orders, items, [])).toBe(items)
  })
})
