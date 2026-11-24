import { describe, it, expect } from 'vitest'
import { initialLoadAmount, FALLBACK_LOAD_AMOUNT } from './holidayLoadAmount'
import { DEFAULT_LOAD_AMOUNT } from './holidayCardLoad'

describe('initialLoadAmount', () => {
  it('לוקח את הסכום למשפחה של החלוקה', () => {
    expect(initialLoadAmount(250)).toBe(250)
    expect(initialLoadAmount(1000)).toBe(1000)
  })

  it('חלוקה בלי סכום — חוזר לברירת המחדל', () => {
    expect(initialLoadAmount(0)).toBe(FALLBACK_LOAD_AMOUNT)
    expect(initialLoadAmount(null)).toBe(FALLBACK_LOAD_AMOUNT)
    expect(initialLoadAmount(undefined)).toBe(FALLBACK_LOAD_AMOUNT)
    expect(initialLoadAmount(-5)).toBe(FALLBACK_LOAD_AMOUNT)
    expect(initialLoadAmount(NaN)).toBe(FALLBACK_LOAD_AMOUNT)
  })

  it('ברירת המחדל זהה לזו של השרת', () => {
    expect(FALLBACK_LOAD_AMOUNT).toBe(DEFAULT_LOAD_AMOUNT)
  })
})
