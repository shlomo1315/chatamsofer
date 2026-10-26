import { describe, it, expect } from 'vitest'
import { canCancelFully, DUPLICATE_LOADS } from './duplicateLoadCancel'

describe('ביטול טעינה עודפת', () => {
  it('מבטל רק כשהיתרה מכסה את כל הטעינה', () => {
    expect(canCancelFully(1200)).toBe(true)
    expect(canCancelFully(600)).toBe(true)
    expect(canCancelFully(599)).toBe(false)
    expect(canCancelFully(null)).toBe(false)
  })
  it('שמונה תיקים, והעודף שונה מהנשמר', () => {
    expect(DUPLICATE_LOADS).toHaveLength(8)
    for (const d of DUPLICATE_LOADS) expect(d.excess).not.toBe(d.kept)
  })
})
