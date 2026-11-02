import { describe, it, expect } from 'vitest'
import { dayKey, inApprovalRange, countByApprovalDay } from './approvalDates'

describe('approvalDates', () => {
  it('מפתח היום לפי שעון ישראל (לא UTC)', () => {
    // 21:30 UTC בקיץ = 00:30 למחרת בישראל
    expect(dayKey('2026-07-10T21:30:00Z')).toBe('2026-07-11')
    expect(dayKey(null)).toBeNull()
    expect(dayKey('לא תאריך')).toBeNull()
  })

  it('טווח: קצוות כלולים, קצה ריק פתוח, בלי תאריך נופל כשיש טווח', () => {
    const d = '2026-07-10T09:00:00Z'
    expect(inApprovalRange(d, '2026-07-10', '2026-07-10')).toBe(true)
    expect(inApprovalRange(d, '2026-07-11', '')).toBe(false)
    expect(inApprovalRange(d, '', '2026-07-09')).toBe(false)
    expect(inApprovalRange(null, '2026-07-01', '')).toBe(false)
    expect(inApprovalRange(null, '', '')).toBe(true)
  })

  it('ספירה יומית מהחדש לישן', () => {
    const rows = [
      { approved_at: '2026-07-10T09:00:00Z' }, { approved_at: '2026-07-10T12:00:00Z' },
      { approved_at: '2026-07-12T09:00:00Z' }, { approved_at: null },
    ]
    expect(countByApprovalDay(rows)).toEqual([{ day: '2026-07-12', count: 1 }, { day: '2026-07-10', count: 2 }])
  })
})
