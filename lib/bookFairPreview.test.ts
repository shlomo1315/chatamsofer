import { describe, it, expect, beforeAll } from 'vitest'
import { bookFairPreviewToken, isValidPreviewToken } from './bookFairPreview'

beforeAll(() => { process.env.OTP_NONCE_SECRET ||= 'test-secret-for-preview' })

describe('אסימון התצוגה המקדימה של היריד', () => {
  const now = Date.UTC(2026, 9, 7, 12)

  it('אסימון טרי תקף', () => {
    expect(isValidPreviewToken(bookFairPreviewToken(now), now)).toBe(true)
  })

  // 🔴 ביקורת 07.10: האסימון היה קבוע לנצח — מי שקיבל אותו פעם אחת
  // יכול היה להזמין גם כשהיריד סגור לעונה.
  it('פג אחרי 12 שעות', () => {
    const t = bookFairPreviewToken(now)
    expect(isValidPreviewToken(t, now + 12 * 60 * 60 * 1000 + 1)).toBe(false)
  })

  it('תוקף מזויף (הארכה) נדחה — החתימה כוללת אותו', () => {
    const t = bookFairPreviewToken(now)!
    const sig = t.slice(t.indexOf('.') + 1)
    const later = now + 11 * 60 * 60 * 1000
    expect(isValidPreviewToken(`${later + 12 * 60 * 60 * 1000}.${sig}`, later)).toBe(false)
  })

  it('האסימון הישן (בלי תוקף) כבר אינו מתקבל', () => {
    expect(isValidPreviewToken('abc123', now)).toBe(false)
    expect(isValidPreviewToken('', now)).toBe(false)
  })
})
