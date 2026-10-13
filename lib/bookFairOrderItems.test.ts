import { describe, it, expect } from 'vitest'
import { aggregateOrderItems } from './bookFairOrderItems'

describe('aggregateOrderItems', () => {
  it('סוכם כמות, כרכים וספרים לכל הזמנה', () => {
    const vols = new Map<string, number | null>([['b1', 3], ['b2', null]])
    const out = aggregateOrderItems([
      { order_id: 'o1', book_id: 'b1', quantity: 2, volumes_snapshot: 1 },
      { order_id: 'o1', book_id: 'b2', quantity: 1, volumes_snapshot: null },
      { order_id: 'o2', book_id: 'b1', quantity: 1, volumes_snapshot: 1 },
    ], vols)
    expect(out.counts).toEqual({ o1: 3, o2: 1 })
    expect(out.books).toEqual({ o1: ['b1', 'b2'], o2: ['b1'] })
    // b1 מהקטלוג (3) ולא מה-snapshot (1); b2 בלי ערך = כרך אחד
    expect(out.volumes).toEqual({ o1: 7, o2: 3 })
  })

  it('ספר שנמחק מהקטלוג נופל ל-snapshot', () => {
    const out = aggregateOrderItems(
      [{ order_id: 'o1', book_id: 'gone', quantity: 2, volumes_snapshot: 4 },
       { order_id: 'o1', book_id: null, quantity: 1, volumes_snapshot: null }],
      new Map(),
    )
    expect(out.volumes).toEqual({ o1: 9 })
    expect(out.books).toEqual({ o1: ['gone'] })
  })
})
