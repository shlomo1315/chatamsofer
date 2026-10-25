import { describe, it, expect } from 'vitest'
import { cardMoneyCells, maternityStatusHe } from './maternityExport'

describe('maternityExport', () => {
  it('מתרגם את כל הסטטוסים לעברית', () => {
    for (const s of ['pending', 'active', 'cancelled', 'completed', 'deep_review']) {
      expect(maternityStatusHe(s)).toMatch(/^[א-ת ]+$/)
    }
    expect(maternityStatusHe('deep_review')).toBe('בבדיקה מעמיקה')
    expect(maternityStatusHe(null)).toBe('')
  })
  it('נוצל = נטען פחות מה שהוחזר', () => {
    expect(cardMoneyCells({ card_load_amount: '600', card_unloaded_amount: '150', card_unloaded_at: 'x' })).toEqual([600, 450, 150])
  })
  it('כרטיס שלא נפרק: נטען בלבד', () => {
    expect(cardMoneyCells({ card_load_amount: 600 })).toEqual([600, null, null])
  })
  it('נוצל במלואו', () => {
    expect(cardMoneyCells({ card_load_amount: 600, card_unloaded_at: 'x', card_load_error: 'נוצל במלואו' })).toEqual([600, 600, 0])
  })
  it('בלי כרטיס', () => {
    expect(cardMoneyCells({})).toEqual([null, null, null])
  })
})
