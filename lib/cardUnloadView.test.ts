import { describe, it, expect } from 'vitest'
import { getCardUnloadView } from './cardUnloadView'

describe('getCardUnloadView', () => {
  it('תיק שנטען רגיל — אין מצב פריקה', () => {
    expect(getCardUnloadView({ card_load_status: 'loaded', card_load_amount: 600 })).toBeNull()
  })
  it('נפרק: נוצלו = טעינה פחות סכום שנפרק', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_at: '2026-10-01', card_unloaded_amount: 150 })
    expect(v).toMatchObject({ unloadedAmount: 150, used: 450, fullySpent: false })
  })
  it('נוצל במלואו (0) — לא נפרק סכום', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_amount: 0 })
    expect(v).toMatchObject({ unloadedAmount: 0, used: 600, fullySpent: true })
  })
  it('סכום לא ידוע (null) — לא מוצג כ-0', () => {
    const v = getCardUnloadView({ card_load_status: 'unloaded', card_load_amount: 600, card_unloaded_amount: null })
    expect(v).toMatchObject({ unloadedAmount: null, used: null, fullySpent: false })
  })
  it('card_unloaded_at ישן אחרי טעינה מחדש — לא נחשב נפרק', () => {
    expect(getCardUnloadView({ card_load_status: 'loaded', card_unloaded_at: '2026-01-01' })).toBeNull()
  })
})
