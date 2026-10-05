import { describe, it, expect } from 'vitest'
import {
  computeStats, filterOrders, lostByChannel, netAgorot, israelDay, israelHour,
  DEFAULT_FILTERS, type StatOrder, type StatItem,
} from './bookFairStats'

const o = (p: Partial<StatOrder>): StatOrder => ({
  id: 'x', status: 'paid', channel: 'web', total_agorot: 10000, refunded_agorot: 0,
  delivery_method: 'shipping', payment_method: 'card', sold_by: null,
  created_at: '2026-10-04T10:00:00Z', city_name: null, picked_up_at: null, ...p,
})

const cats = new Map([['b1', 'דרוש ואגדה'], ['b2', 'שבת ומועדים']])

describe('שעון ישראל', () => {
  it('🔴 הזמנה ב-23:30 UTC שייכת ליום הבא בישראל', () => {
    const d = new Date('2026-10-04T23:30:00Z') // 02:30 בישראל, 05.10
    expect(israelDay(d)).toBe('2026-10-05')
    expect(israelHour(d)).toBe(2)
  })
})

describe('netAgorot', () => {
  it('total − refunded, לעולם לא שלילי', () => {
    expect(netAgorot({ total_agorot: 5000, refunded_agorot: 1500 })).toBe(3500)
    expect(netAgorot({ total_agorot: 5000, refunded_agorot: 9000 })).toBe(0)
  })
})

describe('computeStats', () => {
  const orders = [
    o({ id: '1', channel: 'web', total_agorot: 20000 }),
    o({ id: '2', channel: 'phone', total_agorot: 30000, refunded_agorot: 10000 }),
    o({ id: '3', channel: 'fair', total_agorot: 5000, payment_method: 'cash', sold_by: 'משה', delivery_method: 'pickup' }),
    o({ id: '4', channel: 'fair', total_agorot: 7000, payment_method: 'card', sold_by: 'משה', delivery_method: 'pickup' }),
  ]
  const items: StatItem[] = [
    { order_id: '1', book_id: 'b1', title_snapshot: 'א', quantity: 2, line_total_agorot: 20000 },
    { order_id: '3', book_id: 'b2', title_snapshot: 'ב', quantity: 1, line_total_agorot: 5000 },
  ]
  const s = computeStats(orders, items, cats)

  it('🔴 הכנסה נטו (אחרי זיכוי)', () => {
    expect(s.revenueAgorot).toBe(20000 + 20000 + 5000 + 7000)
  })
  it('פילוח ערוצים', () => {
    expect(s.byChannel.fair).toEqual({ orders: 2, agorot: 12000 })
    expect(s.byChannel.phone.agorot).toBe(20000)
  })
  it('🔴 מזומן / אשראי', () => {
    expect(s.byPayment.cash).toEqual({ orders: 1, agorot: 5000 })
    expect(s.byPayment.card.orders).toBe(3)
  })
  it('מוכרים — דוכן בלבד', () => {
    expect(s.bySeller).toEqual([{ name: 'משה', orders: 2, agorot: 12000 }])
  })
  it('קטגוריות וספרים', () => {
    expect(s.categories[0]).toEqual({ name: 'דרוש ואגדה', agorot: 20000, units: 2 })
    expect(s.units).toBe(3)
  })
})

describe('filterOrders', () => {
  const now = new Date('2026-10-05T12:00:00Z')
  const orders = [
    o({ id: 'today', created_at: '2026-10-05T08:00:00Z' }),
    o({ id: 'yest', created_at: '2026-10-04T08:00:00Z' }),
    o({ id: 'cancel', status: 'cancelled', created_at: '2026-10-05T08:00:00Z' }),
    o({ id: 'big', total_agorot: 90000, created_at: '2026-10-05T08:00:00Z', channel: 'phone' }),
  ]
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) =>
    filterOrders(orders, [], cats, { ...DEFAULT_FILTERS, ...f }, now).map(x => x.id)

  it('🔴 ברירת מחדל — רק ששולמו', () => {
    expect(ids({})).toEqual(['today', 'yest', 'big'])
  })
  it('היום / אתמול', () => {
    expect(ids({ period: 'today' })).toEqual(['today', 'big'])
    expect(ids({ period: 'yesterday' })).toEqual(['yest'])
  })
  it('ערוץ / גודל / סטטוס', () => {
    expect(ids({ channel: 'phone' })).toEqual(['big'])
    expect(ids({ size: 'large' })).toEqual(['big'])
    expect(ids({ status: 'cancelled' })).toEqual(['cancel'])
  })
  it('טווח תאריכים', () => {
    expect(ids({ period: 'range', from: '2026-10-05', to: '2026-10-05' })).toEqual(['today', 'big'])
  })
  it('קטגוריה — הזמנה שיש בה ספר מהקטגוריה', () => {
    const items: StatItem[] = [{ order_id: 'yest', book_id: 'b2', title_snapshot: 'ב', quantity: 1, line_total_agorot: 1 }]
    expect(filterOrders(orders, items, cats, { ...DEFAULT_FILTERS, category: 'שבת ומועדים' }, now).map(x => x.id)).toEqual(['yest'])
  })
})

describe('lostByChannel', () => {
  it('סופר ביטולים וכישלונות לפי ערוץ', () => {
    const l = lostByChannel([
      o({ status: 'cancelled', channel: 'web', total_agorot: 100 }),
      o({ status: 'failed', channel: 'web', total_agorot: 50 }),
      o({ status: 'paid', channel: 'web' }),
    ])
    expect(l.web).toEqual({ cancelled: 1, failed: 1, agorot: 150 })
  })
})
