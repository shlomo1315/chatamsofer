import { describe, it, expect } from 'vitest'
import { summarize, cancelledCharged, inconsistentDigits, type ReconciliationRow } from './bookFairCardReconciliation'

const row = (o: Partial<ReconciliationRow>): ReconciliationRow => ({
  order_number: '1', charged_at: '2026-10-06T22:15:00', amount_agorot: 1000, card_last4: '1234',
  transaction_id: 'x', match_type: 'transaction', deviation_minutes: 0, system_last4: null, ...o,
})

describe('bookFairCardReconciliation', () => {
  it('סופר חיובים, סכום וסוג התאמה', () => {
    const s = summarize([row({}), row({ amount_agorot: 500, match_type: 'amount_time' })])
    expect(s).toEqual({ count: 2, total: 1500, transaction: 1, amountTime: 1 })
  })

  it('מוצא רק הזמנות מבוטלות שחויבו', () => {
    const rows = [row({ order_number: 'a' }), row({ order_number: 'b' })]
    const st = new Map([['a', 'cancelled'], ['b', 'paid']])
    expect(cancelledCharged(rows, st).map(r => r.order_number)).toEqual(['a'])
  })

  it('ספרות לא עקביות רק כשהספרות במערכת שונות', () => {
    const rows = [row({ system_last4: '9999' }), row({ system_last4: '1234' }), row({})]
    expect(inconsistentDigits(rows)).toHaveLength(1)
  })
})
