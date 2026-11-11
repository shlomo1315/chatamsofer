import { describe, it, expect } from 'vitest'
import { secondsUntil, formatCountdown } from './cardRoundTimer'

describe('cardRoundTimer', () => {
  it('מחשב שניות שנותרו', () => {
    expect(secondsUntil(1_000_000 + 125_000, 1_000_000)).toBe(125)
  })
  it('0 כשהזמן הגיע', () => {
    expect(secondsUntil(5000, 5000)).toBe(0)
  })
  it('0 כשהזמן עבר', () => {
    expect(secondsUntil(1000, 9000)).toBe(0)
  })
  it('null כשהזמן לא ידוע', () => {
    expect(secondsUntil(null, 1000)).toBeNull()
    expect(secondsUntil(undefined, 1000)).toBeNull()
  })
  it('מעצב דקות ושניות', () => {
    expect(formatCountdown(125)).toBe('2 דקות ו-5 שניות')
    expect(formatCountdown(0)).toBe('0 דקות ו-0 שניות')
    expect(formatCountdown(3600)).toBe('60 דקות ו-0 שניות')
  })
})
