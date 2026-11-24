import { describe, it, expect } from 'vitest'
import { isLiveDistribution, pickLiveDistribution } from './distributionEnabled'

// ─────────────────────────────────────────────────────────────────────────────
// החלוקה החיה — זו שקישור השיתוף מציג למעלה. כל השאר "חלוקות קודמות".
// ─────────────────────────────────────────────────────────────────────────────

describe('isLiveDistribution', () => {
  it('פעילה ולא מבוטלת — חיה', () => {
    expect(isLiveDistribution({ enabled: true, status: 'active' })).toBe(true)
    expect(isLiveDistribution({ status: 'active' })).toBe(true) // לפני המיגרציה
  })
  it('מושבתת או מבוטלת — לא חיה', () => {
    expect(isLiveDistribution({ enabled: false, status: 'active' })).toBe(false)
    expect(isLiveDistribution({ enabled: true, status: 'cancelled' })).toBe(false)
    expect(isLiveDistribution(null)).toBe(false)
  })
})

describe('pickLiveDistribution', () => {
  // ממוין מהחדשה לישנה, כמו בשאילתה.
  it('בוחרת את העדכנית מבין כמה פעילות', () => {
    const rows = [
      { id: 'chanukah', status: 'active', enabled: true },
      { id: 'sukkot', status: 'active', enabled: true },
    ]
    expect(pickLiveDistribution(rows)?.id).toBe('chanukah')
  })
  it('מדלגת על חדשה יותר שמושבתת או מבוטלת', () => {
    const rows = [
      { id: 'draft', status: 'active', enabled: false },
      { id: 'cancelled', status: 'cancelled', enabled: true },
      { id: 'chanukah', status: 'active', enabled: true },
    ]
    expect(pickLiveDistribution(rows)?.id).toBe('chanukah')
  })
  it('אין חלוקה חיה — null', () => {
    expect(pickLiveDistribution([{ id: 'x', status: 'cancelled' }])).toBeNull()
    expect(pickLiveDistribution([])).toBeNull()
    expect(pickLiveDistribution(null)).toBeNull()
  })
})
