import { describe, it, expect } from 'vitest'
import { maskDigits, spokenCode } from './yemotCall'

describe('maskDigits', () => {
  it('מסתיר את הספרות ולא את הפתיח', () => {
    const out = maskDigits(spokenCode('123456'))
    expect(out).not.toMatch(/אחת|שתיים|שלוש|ארבע|חמש|שש/)
    expect(out).toContain('שלום הקוד שלכם הוא # # # # # #')
  })
  it('הטקסט המוקרא בלי פיסוק', () => {
    expect(spokenCode('123456')).not.toMatch(/[.,;]/)
  })
})
