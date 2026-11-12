import { describe, it, expect } from 'vitest'
import { toFoodCardRow, summarizeFoodCards, NO_HOME } from './maternityFoodCards'

describe('סיכום כרטיסי מזון', () => {
  const rows = [
    toFoodCardRow({ recovery_home: 'טלזסטון', card_load_status: 'loaded', card_loaded_at: '2026-09-03T10:00:00Z', card_load_amount: 1800, card_balance: 400 }),
    toFoodCardRow({ recovery_home: 'טלזסטון', card_load_status: 'loaded', card_loaded_at: '2026-10-01T10:00:00Z', card_load_amount: '1200', card_balance: 0 }),
    toFoodCardRow({ recovery_home: 'ביכורים', card_load_status: 'failed', card_load_amount: 900 }),
    toFoodCardRow({ recovery_home: null, card_load_status: null }),
  ]
  const s = summarizeFoodCards(rows)

  it('סוכם לפי סטטוס וסכום טעינה רק לנטענו', () => {
    expect(s.total.count).toBe(4)
    expect(s.byStatus.loaded).toEqual({ count: 2, loaded: 3000, balance: 400 })
    expect(s.byStatus.failed.loaded).toBe(0)
    expect(s.byStatus.idle.count).toBe(1)
  })
  it('פילוח לפי בית החלמה, כולל ללא בית', () => {
    expect(s.byHome[0].home).toBe('טלזסטון')
    expect(s.byHome.map(h => h.home)).toContain(NO_HOME)
    expect(s.byHome[0].byStatus.loaded).toBe(2)
  })
  it('פילוח לפי חודש טעינה', () => {
    expect(s.byMonth).toEqual([
      { month: '2026-09', count: 1, loaded: 1800 },
      { month: '2026-10', count: 1, loaded: 1200 },
    ])
  })
  it('סכום הפילוחים שווה לסך הכול', () => {
    expect(s.byHome.reduce((n, h) => n + h.total.count, 0)).toBe(s.total.count)
  })
})
